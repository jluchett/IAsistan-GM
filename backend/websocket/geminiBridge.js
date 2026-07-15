import { WebSocketServer, WebSocket } from 'ws';
import dotenv from 'dotenv';
import { gmailToolsSchema } from '../services/toolsSchema.js';

dotenv.config();

const GEMINI_WS_URL = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${process.env.GEMINI_API_KEY}`;

export const setupWebSocketBridge = (server) => {
  const wss = new WebSocketServer({ server });

  wss.on('connection', (clientWs) => {
    console.log('Cliente Frontend conectado al Bridge WS');

    let geminiWs = null;

    if (!process.env.GEMINI_API_KEY) {
       console.error("GEMINI_API_KEY no configurada. Conexión a Gemini fallará.");
       clientWs.send(JSON.stringify({ error: "Missing Gemini API Key in backend" }));
       return;
    }

    try {
      geminiWs = new WebSocket(GEMINI_WS_URL);
      
      geminiWs.on('open', () => {
        console.log('Conectado a Gemini Live API');
        // Enviar configuración inicial (Modelo, Tools, etc.)
        const setupMessage = {
          setup: {
            model: 'models/gemini-2.0-flash-exp', // Modelo que soporta Live API
            tools: [{ functionDeclarations: gmailToolsSchema }]
          }
        };
        geminiWs.send(JSON.stringify(setupMessage));
      });

      geminiWs.on('message', (data) => {
        // Reenviar datos de Gemini (Audio, texto o llamadas a herramientas) al cliente Frontend
        if (clientWs.readyState === WebSocket.OPEN) {
          clientWs.send(data.toString());
        }
        
        // Aquí podemos interceptar function calls para ejecutar la API de Gmail en el backend
        // y luego responder a Gemini con el resultado.
      });

      geminiWs.on('close', () => {
        console.log('Conexión con Gemini Live API cerrada');
      });

      geminiWs.on('error', (error) => {
        console.error('Error en Gemini WS:', error);
      });

    } catch (err) {
      console.error('Error al conectar con Gemini:', err);
    }

    clientWs.on('message', (message) => {
      // Recibe audio PCM base64 o texto del cliente y lo envía a Gemini
      if (geminiWs && geminiWs.readyState === WebSocket.OPEN) {
        geminiWs.send(message);
      }
    });

    clientWs.on('close', () => {
      console.log('Cliente desconectado, cerrando conexión con Gemini');
      if (geminiWs) geminiWs.close();
    });
  });
};
