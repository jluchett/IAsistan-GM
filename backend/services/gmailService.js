import { getGmailService } from '../config/googleAuth.js';

// Helper robusto para extraer el cuerpo de un mensaje de Gmail
function getMessageBody(payload) {
  let body = '';
  if (payload.body && payload.body.data) {
    // Decodificar base64url
    const base64 = payload.body.data.replace(/-/g, '+').replace(/_/g, '/');
    body = Buffer.from(base64, 'base64').toString('utf8');
  } else if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body && part.body.data) {
        const base64 = part.body.data.replace(/-/g, '+').replace(/_/g, '/');
        body += Buffer.from(base64, 'base64').toString('utf8');
      } else if (part.mimeType === 'text/html' && part.body && part.body.data && !body) {
        // Fallback a HTML si no se ha encontrado texto sin formato
        const base64 = part.body.data.replace(/-/g, '+').replace(/_/g, '/');
        body = Buffer.from(base64, 'base64').toString('utf8');
      } else if (part.parts) {
        body += getMessageBody(part);
      }
    }
  }
  return body;
}

// Helper para extraer cabeceras específicas
function getHeader(headers, name) {
  const header = headers.find(h => h.name.toLowerCase() === name.toLowerCase());
  return header ? header.value : '';
}

// 1. Obtener la lista de los correos electrónicos más recientes
export const obtenerUltimosCorreos = async (maxResultados = 5) => {
  const gmail = await getGmailService();
  
  console.log(`[Gmail Service] 📥 Solicitando últimos ${maxResultados} correos...`);
  const response = await gmail.users.messages.list({
    userId: 'me',
    q: 'label:INBOX', // Solo bandeja de entrada
    maxResults: maxResultados
  });

  const messages = response.data.messages || [];
  const emails = [];

  for (const msg of messages) {
    try {
      const details = await gmail.users.messages.get({
        userId: 'me',
        id: msg.id,
        format: 'metadata',
        metadataHeaders: ['From', 'Subject', 'Date']
      });

      const headers = details.data.payload.headers || [];
      emails.push({
        id: msg.id,
        remitente: getHeader(headers, 'From'),
        asunto: getHeader(headers, 'Subject'),
        fecha: getHeader(headers, 'Date'),
        snippet: details.data.snippet || '',
        leido: !details.data.labelIds.includes('UNREAD')
      });
    } catch (err) {
      console.error(`[Gmail Service] Error al obtener detalles del correo ${msg.id}:`, err.message);
    }
  }

  return { emails };
};

// 2. Leer el contenido completo de un correo por su ID
export const leerCorreoPorId = async (id) => {
  const gmail = await getGmailService();
  
  console.log(`[Gmail Service] 📥 Leyendo correo con ID: ${id}...`);
  const response = await gmail.users.messages.get({
    userId: 'me',
    id: id,
    format: 'full'
  });

  const message = response.data;
  const headers = message.payload.headers || [];
  const cuerpo = getMessageBody(message.payload);

  return {
    id: message.id,
    remitente: getHeader(headers, 'From'),
    asunto: getHeader(headers, 'Subject'),
    fecha: getHeader(headers, 'Date'),
    snippet: message.snippet || '',
    cuerpo: cuerpo || message.snippet || '(Sin contenido de texto)',
    etiquetas: message.labelIds || []
  };
};

const SYSTEM_LABELS = new Set([
  'INBOX', 'STARRED', 'UNREAD', 'SPAM', 'TRASH', 'IMPORTANT', 'DRAFT', 'CHAT', 'SENT',
  'CATEGORY_PERSONAL', 'CATEGORY_SOCIAL', 'CATEGORY_PROMOTIONS', 'CATEGORY_UPDATES', 'CATEGORY_FORUMS'
]);

async function resolveLabels(gmail, labelInputs) {
  if (!labelInputs || labelInputs.length === 0) return [];
  try {
    const response = await gmail.users.labels.list({ userId: 'me' });
    const userLabels = response.data.labels || [];
    return labelInputs.map(input => {
      const upperInput = input.toUpperCase();
      if (SYSTEM_LABELS.has(upperInput)) {
        return upperInput;
      }
      const matched = userLabels.find(l => 
        l.name.toLowerCase() === input.toLowerCase() || 
        l.id.toLowerCase() === input.toLowerCase()
      );
      if (matched) {
        console.log(`[Gmail Service] Etiqueta "${input}" resuelta a ID "${matched.id}" (Nombre original: "${matched.name}")`);
        return matched.id;
      }
      return input;
    });
  } catch (err) {
    console.error('[Gmail Service] Error resolviendo etiquetas:', err.message);
    return labelInputs;
  }
}

// 3. Modificar etiquetas de un correo (ej. archivar, marcar leído, destacar)
export const moverCorreoEtiqueta = async (id, addLabelIds = [], removeLabelIds = []) => {
  const gmail = await getGmailService();
  
  // Resolver nombres de etiqueta a IDs reales
  const resolvedAdd = await resolveLabels(gmail, addLabelIds);
  const resolvedRemove = await resolveLabels(gmail, removeLabelIds);
  
  console.log(`[Gmail Service] 📥 Modificando etiquetas de correo ${id}. Agregar original: [${addLabelIds.join(', ')}] -> Resuelto: [${resolvedAdd.join(', ')}]. Eliminar original: [${removeLabelIds.join(', ')}] -> Resuelto: [${resolvedRemove.join(', ')}]`);
  
  const response = await gmail.users.messages.modify({
    userId: 'me',
    id: id,
    requestBody: {
      addLabelIds: resolvedAdd,
      removeLabelIds: resolvedRemove
    }
  });

  return {
    id: response.data.id,
    movido: true,
    etiquetas: response.data.labelIds || []
  };
};

// Helper para construir mensajes en formato RAW MIME (base64url) con soporte UTF-8
function createRawMessage({ to, subject, body, inReplyTo, references }) {
  const parts = [
    `To: ${to}`,
    `Subject: =?utf-8?B?${Buffer.from(subject).toString('base64')}?=`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 7bit',
  ];

  if (inReplyTo) {
    parts.push(`In-Reply-To: ${inReplyTo}`);
  }
  if (references) {
    parts.push(`References: ${references}`);
  }

  // Separador de cabeceras y cuerpo
  parts.push('', body);

  const message = parts.join('\r\n');
  return Buffer.from(message)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

// 4. Crear un borrador (draft) en Gmail
export const crearBorrador = async (destinatario, asunto, cuerpo) => {
  const gmail = await getGmailService();
  
  console.log(`[Gmail Service] 📝 Creando borrador para: ${destinatario}, Asunto: "${asunto}"`);
  
  const raw = createRawMessage({ to: destinatario, subject: asunto, body: cuerpo });
  const response = await gmail.users.drafts.create({
    userId: 'me',
    requestBody: {
      message: {
        raw
      }
    }
  });

  return {
    id: response.data.id,
    creado: true,
    messageId: response.data.message?.id || ''
  };
};

// 5. Enviar un correo electrónico directo
export const enviarCorreo = async (destinatario, asunto, cuerpo) => {
  const gmail = await getGmailService();
  
  console.log(`[Gmail Service] 📤 Enviando correo directo a: ${destinatario}, Asunto: "${asunto}"`);
  
  const raw = createRawMessage({ to: destinatario, subject: asunto, body: cuerpo });
  const response = await gmail.users.messages.send({
    userId: 'me',
    requestBody: {
      raw
    }
  });

  return {
    id: response.data.id,
    enviado: true,
    threadId: response.data.threadId
  };
};

// 6. Responder a un correo electrónico existente (Reply en hilo)
export const responderCorreo = async (idCorreo, cuerpo) => {
  const gmail = await getGmailService();
  
  console.log(`[Gmail Service] ↩️ Generando respuesta para el correo con ID: ${idCorreo}`);
  
  // Obtener metadatos del correo original
  const original = await gmail.users.messages.get({
    userId: 'me',
    id: idCorreo,
    format: 'metadata',
    metadataHeaders: ['Subject', 'Message-ID', 'References', 'From', 'Reply-To']
  });

  const headers = original.data.payload.headers || [];
  const originalMessageId = getHeader(headers, 'Message-ID');
  const originalSubject = getHeader(headers, 'Subject');
  const originalFrom = getHeader(headers, 'Reply-To') || getHeader(headers, 'From');
  const originalReferences = getHeader(headers, 'References') || '';

  // Preparar asunto con "Re: " si no lo tiene
  let subject = originalSubject;
  if (!subject.toLowerCase().startsWith('re:')) {
    subject = `Re: ${subject}`;
  }

  // Encadenar referencias para que los clientes de correo agrupen correctamente
  const references = originalReferences 
    ? `${originalReferences} ${originalMessageId}`.trim()
    : originalMessageId;

  // El destinatario de la respuesta es el remitente del correo original
  const raw = createRawMessage({
    to: originalFrom,
    subject: subject,
    body: cuerpo,
    inReplyTo: originalMessageId,
    references
  });

  const response = await gmail.users.messages.send({
    userId: 'me',
    requestBody: {
      raw,
      threadId: original.data.threadId
    }
  });

  return {
    id: response.data.id,
    respondido: true,
    threadId: response.data.threadId
  };
};
