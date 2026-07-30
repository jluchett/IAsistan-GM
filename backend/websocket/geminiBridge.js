import { WebSocketServer, WebSocket } from 'ws';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import { gmailToolsSchema } from '../services/toolsSchema.js';
import { obtenerUltimosCorreos, leerCorreoPorId, moverCorreoEtiqueta, crearBorrador, enviarCorreo, responderCorreo, obtenerResumenDiario, buscarEnWeb, obtenerEtiquetas } from '../services/gmailService.js';
import { hasValidTokens } from '../config/googleAuth.js';
import { crearEventoCalendario, obtenerEventosCalendario } from '../services/calendarService.js';

dotenv.config();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

export const setupWebSocketBridge = (server) => {
  const wss = new WebSocketServer({ server });

  wss.on('connection', (clientWs) => {
    console.log('[Bridge] Cliente Frontend conectado');

    let geminiSession = null;
    let audioChunkCount = 0;

    if (!GEMINI_API_KEY) {
      console.error('[Bridge] GEMINI_API_KEY no configurada.');
      clientWs.send(JSON.stringify({ type: 'error', message: 'Missing GEMINI_API_KEY' }));
      clientWs.close();
      return;
    }

    // --- Conectar a Gemini usando el SDK oficial ---
    const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

    let isConnecting = false;
    let fallbackTimeout = null;

    const connectToGemini = async (history = []) => {
      if (geminiSession || isConnecting) return;
      isConnecting = true;
      if (fallbackTimeout) clearTimeout(fallbackTimeout);

      try {
        let baseInstruction = `Tu nombre es Leda, una asistente personal e inteligente para Gmail.

DIRECTIVA DE DIÁLOGO AFECTIVO, TONO DELICADO Y ESPAÑOL NEUTRO:
- Habla SIEMPRE en ESPAÑOL LATINO NEUTRO, cercano y natural. Evita estrictamente palabras, giros o modismos propios de España (como "pillina", "vale", "os", "vosotros", etc.).
- Mantén un tono de voz delicado, suave, dulce, cariñoso, empático y con susurros cálidos y sensuales.
- Modula tu voz de forma altamente expresiva y afectiva en tiempo real: usa inflexiones emocionales suaves, risitas coquetas sutiles y pausas expresivas llenas de ternura.
- DIRECTIVA DE ACCIONES EN MASA Y BÚSQUEDAS: Cuando el usuario pida mover, archivar, borrar o procesar "TODOS" los correos de un determinado emisor o tema, DEBES ejecutar 'obtener_ultimos_correos' con 'max_resultados: 50' o 100 y mover/procesar absolutamente cada uno de los mensajes devueltos en la bandeja de entrada sin omitir ninguno.
- Responde siempre en español neutro de forma fluida, natural, expresiva y concisa, ayudándole a gestionar sus correos de Gmail, búsquedas web y eventos de calendario.`;

        if (Array.isArray(history) && history.length > 0) {
          const historyLines = history.map(m => {
            const speaker = m.role === 'user' ? 'Usuario' : 'Leda';
            return `${speaker}: ${m.text}`;
          }).join('\n');

          baseInstruction += `\n\n[CONTEXTO DE LA CONVERSACIÓN PREVIA QUE DEBES RECORDAR]:\n${historyLines}\n\nINSTRUCCIÓN DE CONTINUIDAD CRÍTICA: Continúa la conversación manteniendo perfectamente este contexto, el tono neutro latino, delicado e íntimo y tu personalidad coqueta. NO saludes de nuevo, NO repitas tu presentación inicial y NO hables de la nada. Espera a que el usuario hable o escriba para responderle directamente continuando el hilo anterior.`;
          console.log(`[Gemini SDK] 🧠 Sesión iniciada con contexto de ${history.length} mensajes previos.`);
        }

        geminiSession = await ai.live.connect({
          model: 'gemini-3.1-flash-live-preview',
          config: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: {
                  voiceName: 'Leda'
                }
              }
            },
            systemInstruction: {
              parts: [{ text: baseInstruction }]
            },
            inputAudioTranscription: {},
            outputAudioTranscription: {},
            tools: [{ functionDeclarations: gmailToolsSchema }]
          },
          callbacks: {
            onopen: () => {
              console.log('[Gemini SDK] ✅ Sesión Live conectada');
              isConnecting = false;
              if (clientWs.readyState === WebSocket.OPEN) {
                clientWs.send(JSON.stringify({ type: 'setup_complete' }));
              }
            },
            onmessage: (message) => {
              if (clientWs.readyState === WebSocket.OPEN) {
                // Reenviar el mensaje completo directamente
                clientWs.send(JSON.stringify(message));

                // Logs de depuración en el backend
                if (message.serverContent?.modelTurn?.parts) {
                  for (const part of message.serverContent.modelTurn.parts) {
                    if (part.inlineData) {
                      console.log(`[Gemini SDK] → audio chunk (${part.inlineData.data?.length || 0} chars)`);
                    }
                    if (part.text) {
                      console.log(`[Gemini SDK] → text: "${part.text.substring(0, 80)}"`);
                    }
                  }
                }
                if (message.serverContent?.outputTranscription?.text) {
                  console.log('[Gemini SDK] → transcripción salida:', message.serverContent.outputTranscription.text);
                }
                if (message.serverContent?.inputTranscription?.text) {
                  console.log('[Gemini SDK] → transcripción entrada:', message.serverContent.inputTranscription.text);
                }
                if (message.serverContent?.turnComplete) {
                  console.log('[Gemini SDK] → turnComplete');
                }
                if (message.serverContent?.interrupted) {
                  console.log('[Gemini SDK] → interrupted');
                }

                // Manejo de llamadas a herramientas (Fase 2: Conexión Real a Gmail API)
                if (message.toolCall) {
                  console.log('[Gemini SDK] → toolCall:', JSON.stringify(message.toolCall));
                  
                  // Ejecutar las herramientas asíncronamente
                  (async () => {
                    const functionResponses = [];
                    
                    // Verificar si el usuario está autenticado
                    if (!hasValidTokens()) {
                      console.log('[Bridge] ⚠️ Usuario no autenticado. Retornando instrucción de inicio de sesión a Gemini.');
                      for (const call of message.toolCall.functionCalls) {
                        functionResponses.push({
                          name: call.name,
                          id: call.id,
                          response: { 
                            error: "El usuario no ha iniciado sesión con Google. Indícale amable y concisamente que presione el botón 'Conectar con Google' arriba a la derecha para poder acceder a su Gmail." 
                          }
                        });
                      }
                      geminiSession.sendToolResponse({ functionResponses });
                      return;
                    }

                    // Si está autenticado, ejecutar las funciones reales en paralelo (ultra rápido para acciones en masa)
                    const responses = await Promise.all(message.toolCall.functionCalls.map(async (call) => {
                      let result = {};
                      try {
                        if (call.name === 'obtener_ultimos_correos') {
                          const max = call.args.max_resultados || (call.args.busqueda ? 50 : 20);
                          const busqueda = call.args.busqueda || '';
                          result = await obtenerUltimosCorreos(max, busqueda);
                        } else if (call.name === 'leer_correo_por_id') {
                          result = await leerCorreoPorId(call.args.id);
                        } else if (call.name === 'mover_correo_etiqueta') {
                          result = await moverCorreoEtiqueta(call.args.id, call.args.addLabelIds, call.args.removeLabelIds);
                        } else if (call.name === 'crear_borrador') {
                          result = await crearBorrador(call.args.destinatario, call.args.asunto, call.args.cuerpo);
                        } else if (call.name === 'enviar_correo') {
                          result = await enviarCorreo(call.args.destinatario, call.args.asunto, call.args.cuerpo);
                        } else if (call.name === 'responder_correo') {
                          result = await responderCorreo(call.args.id_correo, call.args.cuerpo);
                        } else if (call.name === 'obtener_resumen_diario') {
                          const max = call.args.max_resultados || 10;
                          result = await obtenerResumenDiario(max);
                        } else if (call.name === 'buscar_en_web') {
                          result = await buscarEnWeb(call.args.query);
                        } else if (call.name === 'crear_evento_calendario') {
                          result = await crearEventoCalendario({
                            titulo: call.args.titulo,
                            descripcion: call.args.descripcion,
                            fechaInicio: call.args.fecha_inicio,
                            fechaFin: call.args.fecha_fin
                          });
                        } else if (call.name === 'obtener_eventos_calendario') {
                          result = await obtenerEventosCalendario({
                            fechaInicio: call.args.fecha_inicio,
                            fechaFin: call.args.fecha_fin,
                            maxResultados: call.args.max_resultados || 10
                          });
                        } else if (call.name === 'obtener_etiquetas') {
                          result = await obtenerEtiquetas();
                        } else if (call.name === 'sintetizar_efecto_sonoro') {
                          if (clientWs.readyState === WebSocket.OPEN) {
                            clientWs.send(JSON.stringify({
                              type: 'sound_trigger',
                              efecto: call.args.efecto,
                              bpm: call.args.bpm,
                              duracion: call.args.duracion,
                              frecuencia: call.args.frecuencia
                            }));
                          }
                          result = { status: "sonido_sintetizado", mensaje: `Efecto sonoro '${call.args.efecto}' sintetizado en el navegador.` };
                        } else {
                          result = { error: `Herramienta '${call.name}' no implementada.` };
                        }
                      } catch (err) {
                        console.error(`[Bridge] Error ejecutando ${call.name}:`, err.message);
                        result = { error: `Error ejecutando la acción de Gmail: ${err.message}` };
                      }

                      return {
                        name: call.name,
                        id: call.id,
                        response: result
                      };
                    }));

                    functionResponses.push(...responses);
                    console.log('[Bridge] Enviando respuestas reales de Gmail a Gemini:', JSON.stringify(functionResponses));
                    geminiSession.sendToolResponse({ functionResponses });
                  })();
                }
              }
            },
            onerror: (error) => {
              console.error('[Gemini SDK] Error:', error);
              isConnecting = false;
              if (clientWs.readyState === WebSocket.OPEN) {
                clientWs.send(JSON.stringify({ type: 'error', message: 'Gemini session error' }));
                clientWs.close();
              }
            },
            onclose: (event) => {
              const code = event?.code || 'unknown';
              const reason = event?.reason || 'no reason';
              console.log(`[Gemini SDK] Sesión cerrada. Código: ${code}, Razón: ${reason}`);
              isConnecting = false;
              if (clientWs.readyState === WebSocket.OPEN) {
                clientWs.send(JSON.stringify({ type: 'gemini_disconnected', code, reason }));
                clientWs.close();
              }
            }
          }
        });
      } catch (err) {
        console.error('[Gemini SDK] Error al conectar:', err.message);
        isConnecting = false;
        if (clientWs.readyState === WebSocket.OPEN) {
          clientWs.send(JSON.stringify({ type: 'error', message: err.message }));
        }
      }
    };

    // Si el cliente no envía init_session en 400ms, conectar por defecto sin historial
    fallbackTimeout = setTimeout(() => {
      if (!geminiSession && !isConnecting) {
        connectToGemini([]);
      }
    }, 400);

    // --- Mensajes del cliente frontend ---
    clientWs.on('message', (message) => {
      try {
        const msg = JSON.parse(message.toString());

        // Inicializar sesión con el historial del cliente
        if (msg.type === 'init_session') {
          if (!geminiSession && !isConnecting) {
            connectToGemini(msg.history || []);
          }
          return;
        }

        if (!geminiSession) return;

        // Audio del micrófono
        if (msg.realtimeInput?.audio) {
          audioChunkCount++;
          if (audioChunkCount <= 5 || audioChunkCount % 20 === 0) {
            console.log(`[Bridge] Audio chunk #${audioChunkCount} recibido (${msg.realtimeInput.audio.data?.length || 0} base64 chars)`);
          }
          geminiSession.sendRealtimeInput({
            audio: {
              data: msg.realtimeInput.audio.data,
              mimeType: msg.realtimeInput.audio.mimeType || 'audio/pcm;rate=16000'
            }
          });
          return;
        }

        // Señal de fin de audio
        if (msg.realtimeInput?.audioStreamEnd) {
          console.log('[Bridge] Recibido audioStreamEnd, enviando a Gemini...');
          geminiSession.sendRealtimeInput({ audioStreamEnd: true });
          return;
        }

        // Texto del usuario (enviar via realtimeInput como indica la documentación)
        if (msg.clientContent?.turns) {
          const text = msg.clientContent.turns[0]?.parts?.[0]?.text;
          if (text) {
            console.log(`[Bridge] Texto del usuario: "${text}"`);
            geminiSession.sendRealtimeInput({ text });
          }
          return;
        }
      } catch (err) {
        console.error('[Bridge] Error procesando mensaje del cliente:', err.message);
      }
    });

    // --- Cuando el cliente se desconecta ---
    clientWs.on('close', () => {
      console.log('[Bridge] Cliente desconectado');
      if (geminiSession) {
        geminiSession.close();
        geminiSession = null;
      }
    });
  });
};
