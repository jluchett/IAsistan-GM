export const gmailToolsSchema = [
  {
    name: "obtener_ultimos_correos",
    description: "Obtiene una lista de los correos electrónicos más recientes de la bandeja de entrada del usuario.",
    parameters: {
      type: "object",
      properties: {
        max_resultados: {
          type: "integer",
          description: "El número máximo de correos a recuperar. Por defecto es 10."
        }
      }
    }
  },
  {
    name: "leer_correo_por_id",
    description: "Lee el contenido completo y los metadatos de un correo electrónico específico usando su ID.",
    parameters: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "El ID único del mensaje de correo electrónico."
        }
      },
      required: ["id"]
    }
  },
  {
    name: "mover_correo_etiqueta",
    description: "Modifica las etiquetas de un correo, por ejemplo para archivarlo o moverlo de carpeta.",
    parameters: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "El ID único del mensaje."
        },
        addLabelIds: {
          type: "array",
          items: { type: "string" },
          description: "Lista de IDs de etiquetas para añadir (ej. 'STARRED')."
        },
        removeLabelIds: {
          type: "array",
          items: { type: "string" },
          description: "Lista de IDs de etiquetas para remover (ej. 'INBOX' para archivar)."
        }
      },
      required: ["id"]
    }
  },
  {
    name: "crear_borrador",
    description: "Crea un borrador (draft) de correo electrónico en la cuenta de Gmail del usuario con el destinatario, asunto y cuerpo especificados.",
    parameters: {
      type: "object",
      properties: {
        destinatario: {
          type: "string",
          description: "La dirección de correo electrónico del destinatario (ej. 'ejemplo@correo.com')."
        },
        asunto: {
          type: "string",
          description: "El asunto del correo electrónico."
        },
        cuerpo: {
          type: "string",
          description: "El contenido del mensaje de correo electrónico en texto sin formato."
        }
      },
      required: ["destinatario", "asunto", "cuerpo"]
    }
  },
  {
    name: "enviar_correo",
    description: "Envía un correo electrónico directo de forma inmediata a un destinatario específico.",
    parameters: {
      type: "object",
      properties: {
        destinatario: {
          type: "string",
          description: "La dirección de correo electrónico del destinatario."
        },
        asunto: {
          type: "string",
          description: "El asunto del correo electrónico."
        },
        cuerpo: {
          type: "string",
          description: "El cuerpo o contenido del correo electrónico."
        }
      },
      required: ["destinatario", "asunto", "cuerpo"]
    }
  },
  {
    name: "responder_correo",
    description: "Responde a un correo electrónico existente basándose en su ID. Obtiene de forma automática el destinatario y añade 'Re: ' al asunto original del hilo.",
    parameters: {
      type: "object",
      properties: {
        id_correo: {
          type: "string",
          description: "El ID único del mensaje original al que se desea responder."
        },
        cuerpo: {
          type: "string",
          description: "El cuerpo de la respuesta que se va a enviar."
        }
      },
      required: ["id_correo", "cuerpo"]
    }
  }
];
