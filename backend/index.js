import express from 'express';
import cors from 'cors';
import http from 'http';
import dotenv from 'dotenv';
import { setupWebSocketBridge } from './websocket/geminiBridge.js';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Crear servidor HTTP para adjuntar WebSockets
const server = http.createServer(app);

// Inicializar puente WebSocket de Gemini
import { getAuthUrl, oauth2Client, saveTokens, hasValidTokens, deleteTokens } from './config/googleAuth.js';

setupWebSocketBridge(server);

// Endpoints básicos HTTP
app.get('/', (req, res) => {
  res.send('Gmail Assistant Backend is running. WS bridge is active.');
});

// Redirigir al consentimiento de Google
app.get('/auth/google', (req, res) => {
  const url = getAuthUrl();
  res.redirect(url);
});

// Callback de Google OAuth2
app.get('/auth/google/callback', async (req, res) => {
  const { code } = req.query;
  if (code) {
    try {
      const { tokens } = await oauth2Client.getToken(code);
      saveTokens(tokens);
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5174';
      res.redirect(`${frontendUrl}/?auth=success`);
    } catch (err) {
      console.error('[OAuth Callback] Error obteniendo tokens:', err.message);
      res.status(500).send(`Error de autenticación: ${err.message}`);
    }
  } else {
    res.status(400).send('No se recibió código de autenticación.');
  }
});

// Comprobar estado de la autenticación
app.get('/auth/status', (req, res) => {
  res.json({ authenticated: hasValidTokens() });
});

// Cerrar sesión (eliminar tokens)
app.post('/auth/logout', (req, res) => {
  const success = deleteTokens();
  res.json({ success });
});

server.listen(port, () => {
  console.log(`Backend server escuchando en http://localhost:${port}`);
});
