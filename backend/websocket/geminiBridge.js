import { WebSocketServer, WebSocket } from 'ws';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import { gmailToolsSchema } from '../services/toolsSchema.js';
import { obtenerUltimosCorreos, leerCorreoPorId, moverCorreoEtiqueta, crearBorrador, enviarCorreo, responderCorreo, obtenerResumenDiario, buscarEnWeb } from '../services/gmailService.js';
import { hasValidTokens } from '../config/googleAuth.js';

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

    const connectToGemini = async () => {
      try {
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
              parts: [{
                text: 'Eres un asistente de Gmail inteligente. Ayudas al usuario a gestionar su correo electrónico: leer, buscar, archivar y organizar sus mensajes. Responde siempre en español de forma concisa y útil.'
              }]
            },
            inputAudioTranscription: {},
            outputAudioTranscription: {},
            tools: [{ functionDeclarations: gmailToolsSchema }]
          },
          callbacks: {
            onopen: () => {
              console.log('[Gemini SDK] ✅ Sesión Live conectada');
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

                    // Si está autenticado, ejecutar las funciones reales
                    for (const call of message.toolCall.functionCalls) {
                      let result = {};
                      try {
                        if (call.name === 'obtener_ultimos_correos') {
                          const max = call.args.max_resultados || 5;
                          result = await obtenerUltimosCorreos(max);
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
                        } else {
                          result = { error: `Herramienta '${call.name}' no implementada.` };
                        }
                      } catch (err) {
                        console.error(`[Bridge] Error ejecutando ${call.name}:`, err.message);
                        result = { error: `Error ejecutando la acción de Gmail: ${err.message}` };
                      }

                      functionResponses.push({
                        name: call.name,
                        id: call.id,
                        response: result
                      });
                    }

                    console.log('[Bridge] Enviando respuestas reales de Gmail a Gemini:', JSON.stringify(functionResponses));
                    geminiSession.sendToolResponse({ functionResponses });
                  })();
                }
              }
            },
            onerror: (error) => {
              console.error('[Gemini SDK] Error:', error);
              if (clientWs.readyState === WebSocket.OPEN) {
                clientWs.send(JSON.stringify({ type: 'error', message: 'Gemini session error' }));
                clientWs.close();
              }
            },
            onclose: (event) => {
              const code = event?.code || 'unknown';
              const reason = event?.reason || 'no reason';
              console.log(`[Gemini SDK] Sesión cerrada. Código: ${code}, Razón: ${reason}`);
              if (clientWs.readyState === WebSocket.OPEN) {
                clientWs.send(JSON.stringify({ type: 'gemini_disconnected', code, reason }));
                clientWs.close();
              }
            }
          }
        });
      } catch (err) {
        console.error('[Gemini SDK] Error al conectar:', err.message);
        if (clientWs.readyState === WebSocket.OPEN) {
          clientWs.send(JSON.stringify({ type: 'error', message: err.message }));
        }
      }
    };

    connectToGemini();

    // --- Mensajes del cliente frontend ---
    clientWs.on('message', (message) => {
      if (!geminiSession) return;

      try {
        const msg = JSON.parse(message.toString());

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
