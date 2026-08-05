import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
dotenv.config();

const TOKENS_PATH = path.resolve('tokens.json');

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI || 'http://localhost:5000/auth/google/callback'
);

// Escuchar evento de actualización automática de tokens
oauth2Client.on('tokens', (newTokens) => {
  console.log('[Google Auth] 🔄 Nuevos tokens recibidos por actualización automática.');
  try {
    let currentTokens = {};
    if (fs.existsSync(TOKENS_PATH)) {
      currentTokens = JSON.parse(fs.readFileSync(TOKENS_PATH, 'utf8'));
    }
    // Combinar tokens para no perder el refresh_token
    const mergedTokens = { ...currentTokens, ...newTokens };
    fs.writeFileSync(TOKENS_PATH, JSON.stringify(mergedTokens, null, 2));
    console.log('[Google Auth] 🔄 Tokens actualizados y guardados en tokens.json.');
  } catch (err) {
    console.error('[Google Auth] Error guardando tokens actualizados:', err.message);
  }
});

// Genera la URL de autenticación
export const getAuthUrl = () => {
  const scopes = [
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/gmail.modify',
    'https://www.googleapis.com/auth/calendar'
  ];
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
    prompt: 'consent' // Forzar consentimiento para asegurar recibir el refresh_token
  });
};

// Guarda los tokens iniciales obtenidos tras el callback
export const saveTokens = (tokens) => {
  try {
    fs.writeFileSync(TOKENS_PATH, JSON.stringify(tokens, null, 2));
    oauth2Client.setCredentials(tokens);
    console.log('[Google Auth] ✅ Tokens iniciales guardados en tokens.json.');
  } catch (err) {
    console.error('[Google Auth] Error al guardar tokens:', err.message);
  }
};

// Carga los tokens y los configura en el cliente OAuth2
export const loadTokens = () => {
  try {
    if (fs.existsSync(TOKENS_PATH)) {
      const tokens = JSON.parse(fs.readFileSync(TOKENS_PATH, 'utf8'));
      oauth2Client.setCredentials(tokens);
      return tokens;
    }
  } catch (err) {
    console.error('[Google Auth] Error cargando tokens.json:', err.message);
  }
  return null;
};

// Verifica si existen tokens guardados
export const hasValidTokens = () => {
  return fs.existsSync(TOKENS_PATH);
};

// Elimina los tokens guardados (Logout)
export const deleteTokens = () => {
  try {
    if (fs.existsSync(TOKENS_PATH)) {
      fs.unlinkSync(TOKENS_PATH);
      oauth2Client.setCredentials({});
      console.log('[Google Auth] 🗑️ tokens.json eliminado con éxito.');
      return true;
    }
  } catch (err) {
    console.error('[Google Auth] Error al eliminar tokens:', err.message);
  }
  return false;
};

// Retorna la instancia del servicio Gmail
export const getGmailService = async () => {
  const tokens = loadTokens();
  if (!tokens) {
    throw new Error('No hay tokens de Google OAuth2 configurados. Autentícate primero.');
  }

  // Refrescar access_token si caducó o caducará en 60 segundos
  if (tokens.expiry_date && (Date.now() >= tokens.expiry_date - 60000)) {
    console.log('[Google Auth] 🔄 Token de acceso expirado. Refrescando automáticamente con OAuth2...');
    try {
      const newTokensResponse = await oauth2Client.refreshAccessToken();
      const newTokens = newTokensResponse.credentials;
      const mergedTokens = { ...tokens, ...newTokens };
      saveTokens(mergedTokens);
      console.log('[Google Auth] ✅ Token de acceso renovado exitosamente.');
    } catch (err) {
      console.error('[Google Auth] Error al refrescar token de acceso:', err.message);
      if (err.message?.includes('invalid_grant')) {
        deleteTokens();
        throw new Error('La sesión de Google ha caducado. Por favor, vuelve a hacer clic en "Conectar con Google" en el botón superior derecho.');
      }
    }
  }

  return google.gmail({ version: 'v1', auth: oauth2Client });
};

export { oauth2Client };
