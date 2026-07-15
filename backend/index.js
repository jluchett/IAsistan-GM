import express from 'express';
import cors from 'cors';
import http from 'http';
import dotenv from 'dotenv';
import { getAuthUrl } from './config/googleAuth.js';
import { setupWebSocketBridge } from './websocket/geminiBridge.js';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Crear servidor HTTP para adjuntar WebSockets
const server = http.createServer(app);

// Inicializar puente WebSocket de Gemini
setupWebSocketBridge(server);

// Endpoints básicos HTTP
app.get('/', (req, res) => {
  res.send('Gmail Assistant Backend is running. WS bridge is active.');
});

app.get('/auth/google', (req, res) => {
  const url = getAuthUrl();
  res.redirect(url);
});

// Endpoint de prueba para el callback
app.get('/auth/google/callback', (req, res) => {
  const { code } = req.query;
  if (code) {
    res.send(`Autenticación exitosa (Código recibido). Regresa a la app. Código: ${code}`);
    // Aquí implementaremos oauth2Client.getToken(code) en las siguientes fases.
  } else {
    res.status(400).send('No se recibió código de autenticación.');
  }
});

server.listen(port, () => {
  console.log(`Backend server escuchando en http://localhost:${port}`);
});
