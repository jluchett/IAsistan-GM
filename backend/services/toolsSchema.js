export const gmailToolsSchema = [
  {
    name: "obtener_ultimos_correos",
    description: "Obtiene una lista de los correos electrónicos más recientes de la bandeja de entrada del usuario.",
    parameters: {
      type: "object",
      properties: {
        max_resultados: {
          type: "integer",
          description: "El número máximo de correos a recuperar. Por defecto es 5."
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
  }
];
