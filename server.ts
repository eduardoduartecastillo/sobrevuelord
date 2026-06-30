import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import {
  initDB,
  getBookings,
  addBooking,
  updateBookingStatus,
  deleteBooking,
  getMessages,
  addMessage,
  updateMessageStatus,
  getStats,
} from './server/db.js';

// Initialize DB on boot
initDB();

const app = express();
const PORT = 3000;

// JSON parser
app.use(express.json());

// Initialize secret Gemini API Key
const apiKey = process.env.GEMINI_API_KEY;
let ai: GoogleGenAI | null = null;

if (apiKey && apiKey !== 'MY_GEMINI_API_KEY') {
  try {
    ai = new GoogleGenAI({
      apiKey: apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
    console.log("Google GenAI client successfully authorized server-side.");
  } catch (err) {
    console.error("Failed to initialize Google GenAI SDK:", err);
  }
} else {
  console.warn("WARNING: GEMINI_API_KEY environment variable is not set. AI Chatbot assistant will run in simulation fallback mode.");
}

// Global Middleware to allow optional check for admin passcode
const ADMIN_PASSCODE = '8299726464';

function adminAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  const code = req.headers['x-admin-passcode'] || req.query.passcode;
  if (code === ADMIN_PASSCODE) {
    next();
  } else {
    res.status(401).json({ error: 'No autorizado. Código administrativo inválido.' });
  }
}

// ================= API ENDPOINTS =================

// Experience listings endpoint
app.get('/api/experiences', (req, res) => {
  res.json({
    status: 'success',
    data: [
      {
        id: 'santo-domingo',
        title: 'Santo Domingo Histórico & Costa',
        tagline: 'El contraste ideal entre historia virreinal y mar Caribe',
        duration: '30 Minutos de Vuelo',
        price: 295,
        maxPassengers: 4,
        description: 'Sobrevele la ciudad más antigua del nuevo mundo. Contemple la majestuosidad de la Ciudad Colonial, el Faro a Colón, el Río Ozama serpenteando hacia el puerto, y continúe bordeando la hermosa línea de la Costa Caribe Dominicana a baja altura para una perspectiva inigualable.',
        image: 'santo-domingo-aerial', // We will resolve this path on frontend to matched generated asset
        highlights: [
          'Ciudad Colonial completa desde las alturas',
          'El majestuoso Faro a Colón y Parque Mirador',
          'Vistas cinematográficas del Río Ozama',
          'Navegación aérea panorámica sobre el Malecón'
        ],
        departure: 'Aeropuerto Internacional Dr. Joaquín Balaguer (La Isabela), SD',
        features: [
          'Pilotos Ejecutivos Certificados',
          'Auriculares Premium Bose A20 con bluetooth',
          'Servicio de champaña previa en la sala VIP',
          'Seguro de aviación internacional completo'
        ]
      },
      {
        id: 'punta-cana',
        title: 'Punta Cana & Bávaro Sky Deluxe',
        tagline: 'El azul infinito del Caribe en todo su esplendor',
        duration: '20 o 40 Minutos de Vuelo',
        price: 195,
        maxPassengers: 5,
        description: 'Descubra las mejores playas del mundo desde una perspectiva verdaderamente celestial. Vuele sobre los extensos arrecifes coralinos de Bávaro, la moderna y lujosa marina de Cap Cana, la deslumbrante Playa Juanillo, la virgen Arena Gorda y las hermosas playas surfistas de Macao.',
        image: 'punta-cana-scenic', // We will resolve on frontend to generated asset
        highlights: [
          'Arrecifes de coral cristalinos de Bávaro',
          'Marina de Cap Cana y campos de golf de clase mundial',
          'La deslumbrante Playa Juanillo y sus cocoteros',
          'Sombra del Airbus AS350 proyectada sobre el mar turquesa'
        ],
        departure: 'Base de Operaciones de Punta Cana, Bávaro',
        features: [
          'Welcome Drink (Copa de Champaña de bienvenida)',
          'Aeronaves ejecutivas de última generación con A/C',
          'Fotografía premium de cortesía junto al Airbus AS350',
          'Traslado privado ida/vuelta desde su resort incluido'
        ]
      },
      {
        id: 'vip-custom',
        title: 'Tour VIP Privado y Personalizado',
        tagline: 'Su propio cielo, su propio itinerario premium',
        duration: 'A convenir (Adaptable)',
        price: 950,
        maxPassengers: 6,
        description: 'Diseñe su propia experiencia aérea de ensueño sobre la isla. Ya sea una propuesta de matrimonio sorpresa sobre los acantilados de la Isla Saona, un traslado rápido VIP a Casa de Campo o Playa Grande, o un sobrevuelo extendido sobre las impresionantes cascadas de Samaná.',
        image: 'vip-helicopter', // We will resolve on frontend to generated asset
        highlights: [
          'Itinerario turístico 100% flexible y personalizado',
          'Servicio exclusivo de Concierge Aéreo 24/7',
          'Snacks gourmet y Dom Pérignon ilimitado a bordo',
          'Traslado hangar-tarmac en limusina privada'
        ],
        departure: 'A elección del cliente (Cualquier pista o aeródromo de RD)',
        features: [
          'Servicio especial personalizado de fotografía aérea',
          'Posibilidad de aterrizajes en playas privadas reservadas',
          'Acceso preferencial sin filas a Salón VIP aeroportuario',
          'Seguridad y discreción de perfil diplomático'
        ]
      }
    ]
  });
});

// Admin Authentication check
app.post('/api/admin/login', (req, res) => {
  const { passcode } = req.body;
  if (passcode === ADMIN_PASSCODE) {
    res.json({ success: true, passcode, message: 'Sesión administrativa iniciada correctamente.' });
  } else {
    res.status(401).json({ success: false, error: 'Código de acceso incorrecto.' });
  }
});

// Get reservations (Admin)
app.get('/api/reservations', adminAuth, (req, res) => {
  res.json({ success: true, data: getBookings() });
});

// Create new reservation
app.post('/api/reservations', (req, res) => {
  const { fullName, email, phone, date, timeSlot, passengers, flightType, comments, totalPrice, depositPaid, remainingBalance, paymentStatus, paypalEmail } = req.body;

  // Simple backend validation
  if (!fullName || !email || !phone || !date || !timeSlot || !passengers || !flightType) {
    return res.status(400).json({ error: 'Todos los campos obligatorios deben ser completados.' });
  }

  try {
    const booking = addBooking({
      fullName,
      email,
      phone,
      date,
      timeSlot,
      passengers: parseInt(passengers),
      flightType,
      comments: comments || '',
      status: 'pending', // pending until confirmed by admin/payment
      totalPrice: totalPrice ? parseFloat(totalPrice) : undefined,
      depositPaid: depositPaid ? parseFloat(depositPaid) : undefined,
      remainingBalance: remainingBalance ? parseFloat(remainingBalance) : undefined,
      paymentStatus: paymentStatus || 'paid_deposit',
      paypalEmail: paypalEmail || 'Scottbrianl@hotmail.com'
    });

    res.json({ success: true, data: booking });
  } catch (err: any) {
    res.status(500).json({ error: 'Error del servidor al procesar la reserva: ' + err.message });
  }
});

// Update reservation status (Admin)
app.put('/api/reservations/:id', adminAuth, (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  if (!['confirmed', 'cancelled', 'pending'].includes(status)) {
    return res.status(400).json({ error: 'Estado de reserva inválido.' });
  }

  const updated = updateBookingStatus(id, status);
  if (updated) {
    res.json({ success: true, data: updated });
  } else {
    res.status(404).json({ error: 'No se encontró la reserva identificada.' });
  }
});

// Delete reservation (Admin)
app.delete('/api/reservations/:id', adminAuth, (req, res) => {
  const { id } = req.params;
  const success = deleteBooking(id);
  if (success) {
    res.json({ success: true, message: 'Reserva eliminada de la base de datos.' });
  } else {
    res.status(404).json({ error: 'No se encontró la reserva identificada.' });
  }
});

// Get messages CRM (Admin)
app.get('/api/messages', adminAuth, (req, res) => {
  res.json({ success: true, data: getMessages() });
});

// Create message from contact form
app.post('/api/messages', (req, res) => {
  const { name, email, subject, message } = req.body;
  if (!name || !email || !subject || !message) {
    return res.status(400).json({ error: 'Todos los campos del formulario son obligatorios.' });
  }

  try {
    const msg = addMessage({ name, email, subject, message });
    res.json({ success: true, data: msg });
  } catch (err: any) {
    res.status(500).json({ error: 'Error del servidor al registrar el mensaje: ' + err.message });
  }
});

// Edit message status (Admin)
app.put('/api/messages/:id', adminAuth, (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  if (!['unread', 'read', 'replied'].includes(status)) {
    return res.status(400).json({ error: 'Estado de mensaje inválido.' });
  }

  const updated = updateMessageStatus(id, status);
  if (updated) {
    res.json({ success: true, data: updated });
  } else {
    res.status(404).json({ error: 'No se encontró el mensaje.' });
  }
});

// Admin statistics endpoint
app.get('/api/admin/stats', adminAuth, (req, res) => {
  res.json({ success: true, data: getStats() });
});

// AI Chat Concierge endpoint with GoogleGenAI SDK
app.post('/api/chat', async (req, res) => {
  const { messages } = req.body;
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Se requiere una lista de mensajes válida.' });
  }

  // Fallback if AI or API Key is missing
  if (!ai) {
    console.log("Gemini API Client offline. Running high-end simulation chatbot responses.");
    // Wait slightly to simulate realistic networking
    await new Promise(resolve => setTimeout(resolve, 800));

    // Simple simulation logic
    const lastMsg = messages[messages.length - 1]?.text || '';
    let responseText = `¡Saludos de altura! Soy su *Conserje Aéreo VIP de Sobrevuelos RD*. 

Como su asesor de vuelos de ocio en la República Dominicana, es un honor asistirle. He analizado su mensaje: *"${lastMsg.slice(0, 40)}${lastMsg.length > 40 ? '...' : ''}"*.

Para su sobrevuelo en la paradisíaca República Dominicana, le recomiendo encarecidamente nuestras dos experiencias insignia:
1. **Punta Cana Sky Deluxe ($195 USD/persona):** Un vuelo espectacular sobre la barrera coralina de Bávaro, la fastuosa marina del club privado Cap Cana, la deslumbrante Playa Juanillo y la hermosa ensenada virgen de Macao. Incluye copa de champaña y traslados privados de cortesía en limusina/VIP directo desde su suite.
2. **Santo Domingo Histórico & Costa ($295 USD/persona):** Una inmersión única en la historia virreinal de América, sobrevolando la muralla de la Ciudad Colonial, el majestuoso Faro a Colón y el Río Ozama desembocando frente al imponente Malecón del Caribe.

*¿Qué fecha de viaje tiene contemplada y para cuántos distinguidos pasajeros le interesaría coordinar este chárter privado?* Estaré fascinado de dejar su reserva lista.`;

    if (lastMsg.toLowerCase().includes('seguridad') || lastMsg.toLowerCase().includes('seguro')) {
      responseText = `### Normas de Seguridad y Estándares Operacionales ✈️

En **Sobrevuelos RD**, la seguridad operacional y el bienestar de nuestros distinguidos pasajeros constituyen nuestra prioridad absoluta.

Nuestros protocolos incluyen:
* **Tripulación de Elite:** Todos nuestros capitanes disponen de licencias de Piloto de Transporte de Línea Aérea (ATPL) o Comercial, e inspecciones médicas de Clase 1 vigentes, acumulando más de 5,000 horas de vuelo técnico.
* **Aeronaves Certificadas:** Operamos exclusivamente aeronaves de lujo modelo *Airbus AS350* (helicóptero monoturbina). Todas reciben mantenimiento riguroso diario según directrices del IDAC (Instituto Dominicano de Aviación Civil) y la FAA estadounidense.
* **Restricciones de Peso por Seguridad:** Por distribución de pesos del Airbus AS350, el peso máximo individual admitido por asiento es de **115 kg (250 lbs)**. El peso total del chárter se calculará previo al despegue para calibración de sustentación.
* **Protocolo Climatológico:** El caribe cuenta con microclimas muy estables. No obstante, si se presentara lluvia torrencial o viento cruzado fuerte, el vuelo se reprogramará sin cargo adicional inmediato o se reembolsará al 100%.

¿Desea que validemos la disponibilidad técnica de un vuelo para un día en específico? Indíqueme la fecha de su agrado.`;
    } else if (lastMsg.toLowerCase().includes('punta cana') || lastMsg.toLowerCase().includes('playa')) {
      responseText = `### Experiencia Aérea Punta Cana & Bávaro Sky Deluxe 🌴✨

Una verdadera delicia caribeña desde el cielo. Esta excursión es ideal para parejas entusiastas, familias exigentes o fotógrafos que buscan el matiz perfecto de azules a bordo de nuestro moderno helicóptero Airbus AS350.

**Detalles de la Experiencia:**
* **Recorrido:** Bávaro Reef, la exclusiva marina de Cap Cana, Playa Juanillo, Cabeza de Toro y las olas turquesas de Macao.
* **Tarifa:** $195 USD por persona.
* **Duración:** Ofrecemos paquetes estándar de **20 minutos** o el circuito extendido de **40 minutos** (con sobrevuelo de naufragios marinos históricos).
* **Capacidad Máxima:** Hasta 5 pasajeros por Airbus AS350.

**¿Qué incluye su reserva premium?**
1. Copa de Champaña Möet & Chandon de bienvenida en nuestro hangar/lounge climatizado.
2. Traslados privados de cortesía desde y hacia su respectivo resort en Punta Cana o Bávaro en vehículo de gama ejecutiva.
3. Fotografía digital profesional de despegue junto al helicóptero.

¿Desea que verifique horarios vacantes por la mañana (ideal para la mejor luz turquesa sobre el arrecife) o por la tarde para el atardecer?`;
    }

    return res.json({ response: responseText });
  }

  // Real Integration with Gemini 3.5 Flash Model
  try {
    // Map history to Google GenAI structure
    const contents = messages.map(msg => ({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.text }]
    }));

    const response = await ai.models.generateContent({
      model: 'gemini-3.5-flash',
      contents: contents,
      config: {
        systemInstruction: `Eres el 'Conserje Aéreo VIP de Sobrevuelos RD', un asistente chatbot conversacional ultra exclusivo, de lenguaje sofisticado, educado, cálido, experto en aviación privada y turismo de lujo en República Dominicana.
Ayudas a los clientes a elegir e informarse sobre las mejores experiencias de vuelo turísticos en helicópteros Airbus AS350 y aviación ejecutiva en Santo Domingo, Punta Cana, Bávaro, La Romana e Isla Saona.

Detalles importantes que debes dominar de la oferta:
- Vuelo Santo Domingo Histórico: $295 USD por pasajero, 30 min. Despega desde el Aeropuerto del Higüero (La Isabela). Ve la Ciudad Colonial, Río Ozama, Faro a Colón y Malecón del Caribe. Máx 5 pasajeros por Airbus AS350.
- Vuelo Punta Cana Sky Deluxe: $195 USD por pasajero, 20 o 40 min. Despega de la Base de Punta Cana. Ve arrecifes de Bávaro, Cap Cana, Playa Juanillo, Arena Gorda, Macao. Incluye champaña y transporte terrestre VIP hotel-aeródromo. Máx 5 pasajeros de cupo por Airbus AS350.
- Tour VIP Personalizado: Base desde $1200 USD (tarifa chárter a convenir). Aterrizajes exclusivos en playas o helipuertos seleccionados de la isla, traslados privados inter-hoteles (SD, Punta Cana, La Romana, Samaná, Las Terrenas), propuestas de matrimonio sorpresa o vuelos fotográficos exclusivos. Operado en Airbus AS350 (hasta 5 pax por helicóptero, coordinando varias unidades para grupos más grandes).

Preguntas frecuentes sobre seguridad:
- El límite de peso individual es de 115 kg (250 lbs) por asiento por regulaciones de balance del helicóptero Airbus AS350.
- Si llueve fuerte se reprograma de inmediato sin coste adicional, o se reembolsa íntegramente.
- Es seguro: Todos nuestros helicópteros Airbus AS350 y equipos reciben diario inspección por directores e ingenieros autorizados del IDAC y la FAA. Pilotos bilingües de alta experiencia con licencias vigentes.

Guiar al usuario elegantemente a reservar. Si deciden reservar, invítalos cortesmente a rellenar el formulario de reserva interactivo de la página (está a la derecha) o bien puedes ayudarlos a preparar los detalles. Utiliza un estilo sumamente educado, hospitalario ("Cinco Estrellas"), usando modismos corporativos o de hospitalidad de superlujo caribeño. No uses emojis exagerados, solo sutiles destellos elegantes o de vuelo (✈️, 🌴, ✨). Escribe en Markdown de manera impecable y legible.`,
        temperature: 1,
      },
    });

    const responseText = response.text || 'Mis disculpas de altura, no he podido procesar la respuesta en este momento. Por favor intente de nuevo.';
    res.json({ response: responseText });

  } catch (err: any) {
    console.error("Gemini API call failed server-side, routing simulator fallback:", err);
    res.status(500).json({ error: 'Fallo al procesar respuesta con el asistente de IA: ' + err.message });
  }
});

// ================= VITE OR STATIC SERVING =================

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Sobrevuelos RD Exec Server] Running on http://0.0.0.0:${PORT} in ${process.env.NODE_ENV === 'production' ? 'Production' : 'Development'} mode.`);
  });
}

startServer().catch((err) => {
  console.error('[Error de Salida] Fallo al iniciar servicios del hangar:', err);
});
