export const gmailToolsSchema = [
  {
    name: "obtener_ultimos_correos",
    description: "Obtiene una lista de correos electrónicos de la cuenta del usuario. Permite buscar por remitente, palabra clave o tema específico.",
    parameters: {
      type: "object",
      properties: {
        max_resultados: {
          type: "integer",
          description: "El número máximo de correos a recuperar. Por defecto es 10."
        },
        busqueda: {
          type: "string",
          description: "Término de búsqueda opcional para buscar correos específicos (ej. 'Ruta N', 'from:Ruta N', 'factura', 'banco')."
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
  },
  {
    name: "obtener_resumen_diario",
    description: "Obtiene un consolidado de los correos electrónicos más recientes (remitente, asunto, fecha, leído y contenido parcial) de la bandeja de entrada del usuario en una sola llamada para generar un boletín hablado o resumen diario.",
    parameters: {
      type: "object",
      properties: {
        max_resultados: {
          type: "integer",
          description: "El número de correos electrónicos a incluir en el resumen consolidado. Por defecto es 10."
        }
      }
    }
  },
  {
    name: "buscar_en_web",
    description: "Busca en la web en tiempo real para obtener información de actualidad, respuestas a preguntas generales, cotizaciones, noticias o detalles de productos que sirvan para responder al usuario o complementar un correo electrónico.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Los términos de búsqueda clave (ej. 'precio de bitcoin hoy', 'clima en madrid')."
        }
      },
      required: ["query"]
    }
  },
  {
    name: "crear_evento_calendario",
    description: "Crea o agenda un nuevo evento o reunión en el calendario de Google (Google Calendar) del usuario.",
    parameters: {
      type: "object",
      properties: {
        titulo: {
          type: "string",
          description: "El título, asunto o resumen del evento (ej. 'Reunión de desarrollo', 'Cita médica')."
        },
        descripcion: {
          type: "string",
          description: "Descripción detallada opcional del evento. Puede incluir enlaces o notas del correo electrónico."
        },
        fecha_inicio: {
          type: "string",
          description: "La fecha y hora de inicio del evento en formato ISO 8601 (ej. '2026-07-24T15:00:00-05:00')."
        },
        fecha_fin: {
          type: "string",
          description: "La fecha y hora de finalización del evento en formato ISO 8601 (ej. '2026-07-24T16:00:00-05:00'). Si no se indica, durará una hora por defecto."
        }
      },
      required: ["titulo", "fecha_inicio"]
    }
  },
  {
    name: "obtener_eventos_calendario",
    description: "Consulta, lee o lista los eventos y reuniones del Google Calendar del usuario.",
    parameters: {
      type: "object",
      properties: {
        fecha_inicio: {
          type: "string",
          description: "Fecha/hora de inicio en ISO 8601 a partir de la cual consultar los eventos (ej. '2026-07-27T00:00:00-05:00'). Si no se indica, consulta desde hoy."
        },
        fecha_fin: {
          type: "string",
          description: "Fecha/hora de fin en ISO 8601 hasta la cual consultar los eventos (ej. '2026-07-27T23:59:59-05:00')."
        },
        max_resultados: {
          type: "integer",
          description: "Número máximo de eventos a devolver. Por defecto 10."
        }
      }
    }
  },
  {
    name: "obtener_etiquetas",
    description: "Obtiene la lista de todas las etiquetas (labels) de la cuenta de Gmail del usuario, incluidas las creadas manualmente.",
    parameters: {
      type: "object",
      properties: {}
    }
  }
];
