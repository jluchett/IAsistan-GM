import { google } from 'googleapis';
import { oauth2Client, loadTokens } from '../config/googleAuth.js';

const getCalendarService = async () => {
  const tokens = loadTokens();
  if (!tokens) {
    throw new Error('No hay tokens de Google OAuth2 configurados. Autentícate primero.');
  }
  return google.calendar({ version: 'v3', auth: oauth2Client });
};

export const crearEventoCalendario = async ({ titulo, descripcion = '', fechaInicio, fechaFin }) => {
  const calendar = await getCalendarService();
  
  // Si no se proporciona fecha de fin, le sumamos 1 hora por defecto
  let end = fechaFin;
  if (!end) {
    const start = new Date(fechaInicio);
    start.setHours(start.getHours() + 1);
    end = start.toISOString();
  }

  console.log(`[Calendar Service] 📅 Creando evento en Google Calendar: "${titulo}", Inicio: ${fechaInicio}, Fin: ${end}`);

  const response = await calendar.events.insert({
    calendarId: 'primary',
    requestBody: {
      summary: titulo,
      description: descripcion,
      start: {
        dateTime: fechaInicio,
        timeZone: process.env.TIMEZONE || 'America/Bogota'
      },
      end: {
        dateTime: end,
        timeZone: process.env.TIMEZONE || 'America/Bogota'
      }
    }
  });

  return {
    id: response.data.id,
    creado: true,
    link: response.data.htmlLink,
    titulo: response.data.summary
  };
};

export const obtenerEventosCalendario = async ({ fechaInicio, fechaFin, maxResultados = 10 }) => {
  const calendar = await getCalendarService();

  // Si no se especifican fechas, por defecto consultamos desde el inicio del día de hoy
  const timeMin = fechaInicio ? new Date(fechaInicio).toISOString() : new Date(new Date().setHours(0, 0, 0, 0)).toISOString();
  const timeMax = fechaFin ? new Date(fechaFin).toISOString() : undefined;

  console.log(`[Calendar Service] 📅 Listando eventos de Google Calendar desde: ${timeMin}`);

  const response = await calendar.events.list({
    calendarId: 'primary',
    timeMin: timeMin,
    timeMax: timeMax,
    maxResults: maxResultados,
    singleEvents: true,
    orderBy: 'startTime'
  });

  const events = (response.data.items || []).map(evt => ({
    id: evt.id,
    titulo: evt.summary,
    descripcion: evt.description || '',
    inicio: evt.start?.dateTime || evt.start?.date,
    fin: evt.end?.dateTime || evt.end?.date,
    link: evt.htmlLink
  }));

  return { eventos: events, total: events.length };
};
