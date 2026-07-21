import { useState, useEffect, useRef, useCallback } from 'react';
import './index.css';
import { useAudioCapture } from './hooks/useAudioCapture';

const WS_URL = 'ws://localhost:5000';

// Decodifica base64 PCM 24kHz 16-bit mono y lo reproduce via Web Audio API
function createAudioPlayer() {
  let audioCtx = null;
  let nextStartTime = 0;

  const play = (base64Data) => {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 24000 });
    }

    // Decodificar base64 → ArrayBuffer → Int16 → Float32
    const binaryStr = atob(base64Data);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }
    const int16 = new Int16Array(bytes.buffer);
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) {
      float32[i] = int16[i] / 32768;
    }

    // Crear AudioBuffer y programar reproducción
    const audioBuffer = audioCtx.createBuffer(1, float32.length, 24000);
    audioBuffer.getChannelData(0).set(float32);

    const source = audioCtx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioCtx.destination);

    const now = audioCtx.currentTime;
    if (nextStartTime < now) {
      nextStartTime = now;
    }
    source.start(nextStartTime);
    nextStartTime += audioBuffer.duration;
  };

  const stop = () => {
    nextStartTime = 0;
  };

  return { play, stop };
}

function App() {
  const [messages, setMessages] = useState([
    { role: 'ai', text: '¡Hola! Soy tu asistente de Gmail. Escribe un mensaje o presiona el micrófono para hablar.' }
  ]);
  const [connectionStatus, setConnectionStatus] = useState('connecting');
  const [textInput, setTextInput] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const wsRef = useRef(null);
  const chatEndRef = useRef(null);
  const audioPlayerRef = useRef(createAudioPlayer());

  // Scroll automático
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Chequear estado de autenticación de Google al montar
  useEffect(() => {
    const checkAuthStatus = async () => {
      // 1. Detectar si venimos redireccionados con éxito (?auth=success)
      const params = new URLSearchParams(window.location.search);
      if (params.get('auth') === 'success') {
        setIsAuthenticated(true);
        setIsAuthLoading(false);
        // Limpiar URL
        window.history.replaceState({}, document.title, window.location.pathname);
        return;
      }

      // 2. Si no, consultar al backend
      try {
        const res = await fetch('http://localhost:5000/auth/status');
        const data = await res.json();
        setIsAuthenticated(data.authenticated);
      } catch (err) {
        console.error('Error verificando estado de autenticación:', err);
      } finally {
        setIsAuthLoading(false);
      }
    };

    checkAuthStatus();
  }, []);

  // Redirigir al flujo de Login
  const handleLogin = () => {
    window.location.href = 'http://localhost:5000/auth/google';
  };

  // Cerrar sesión
  const handleLogout = async () => {
    try {
      const res = await fetch('http://localhost:5000/auth/logout', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setIsAuthenticated(false);
        setConnectionStatus('connecting');
        if (wsRef.current) {
          wsRef.current.close();
        }
      }
    } catch (err) {
      console.error('Error al cerrar sesión:', err);
    }
  };

  // Audio capture callback
  const handleAudioData = useCallback((base64Audio) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      // Formato correcto según la Live API: usar "audio" en vez del deprecado "mediaChunks"
      const message = {
        realtimeInput: {
          audio: {
            data: base64Audio,
            mimeType: "audio/pcm;rate=16000"
          }
        }
      };
      wsRef.current.send(JSON.stringify(message));
    }
  }, []);

  // Enviar audioStreamEnd cuando el usuario deja de grabar
  // Esto le dice a Gemini que el stream de audio terminó y debe procesar lo recibido
  const handleRecordingStop = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      const endSignal = {
        realtimeInput: {
          audioStreamEnd: true
        }
      };
      wsRef.current.send(JSON.stringify(endSignal));
      console.log('📤 Enviado audioStreamEnd a Gemini');
    }
  }, []);

  const [volume, setVolume] = useState(0);

  const { isRecording, startRecording, stopRecording } = useAudioCapture(handleAudioData, handleRecordingStop, setVolume);

  // Conexión WebSocket al backend (solo si está autenticado)
  useEffect(() => {
    if (!isAuthenticated) return;

    let ws = null;
    let isCancelled = false;
    let reconnectTimeout = null;

    const connect = () => {
      if (isCancelled) return;

      setConnectionStatus('connecting');
      ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        if (isCancelled) { ws.close(); return; }
        console.log('Conectado al Bridge WS del backend');
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          // Handshake: Gemini completó el setup
          if (data.type === 'setup_complete') {
            console.log('✅ Gemini Live API lista');
            setConnectionStatus('ready');
            return;
          }

          // Error del backend
          if (data.type === 'error') {
            console.error('Error del backend:', data.message);
            setConnectionStatus('error');
            return;
          }

          // Gemini se desconectó
          if (data.type === 'gemini_disconnected') {
            console.warn('Gemini desconectado, código:', data.code);
            setConnectionStatus('error');
            return;
          }

          // --- Procesar respuestas de Gemini ---

          // Audio de respuesta (serverContent.modelTurn.parts con inlineData)
          if (data.serverContent?.modelTurn?.parts) {
            for (const part of data.serverContent.modelTurn.parts) {
              if (part.inlineData?.data) {
                // Reproducir audio de Gemini
                audioPlayerRef.current.play(part.inlineData.data);
              }
              // Si hubiera texto (poco probable con AUDIO modality, pero por si acaso)
              if (part.text) {
                setMessages(prev => [...prev, { role: 'ai', text: part.text }]);
              }
            }
          }

          // Transcripción de la respuesta de Gemini (texto de lo que dice por voz)
          if (data.serverContent?.outputTranscription?.text) {
            const transcript = data.serverContent.outputTranscription.text;
            setMessages(prev => {
              // Acumular transcripción en el último mensaje AI o crear uno nuevo
              const last = prev[prev.length - 1];
              if (last && last.role === 'ai' && last.isTranscript) {
                const updated = [...prev];
                updated[updated.length - 1] = { ...last, text: last.text + transcript };
                return updated;
              }
              return [...prev, { role: 'ai', text: transcript, isTranscript: true }];
            });
          }

          // Transcripción de lo que dijo el usuario
          if (data.serverContent?.inputTranscription?.text) {
            const userText = data.serverContent.inputTranscription.text;
            setMessages(prev => {
              const last = prev[prev.length - 1];
              if (last && last.role === 'user' && last.isTranscript) {
                const updated = [...prev];
                updated[updated.length - 1] = { ...last, text: last.text + userText };
                return updated;
              }
              return [...prev, { role: 'user', text: userText, isTranscript: true }];
            });
          }

          // Gemini indicó que terminó de hablar (turnComplete)
          if (data.serverContent?.turnComplete) {
            console.log('Gemini terminó su turno');
          }

          // Interrupción (el usuario habló mientras Gemini respondía)
          if (data.serverContent?.interrupted) {
            console.log('Gemini fue interrumpido');
            audioPlayerRef.current.stop();
          }

          // Function calls (Fase 2)
          if (data.toolCall) {
            console.log('Gemini solicita función:', JSON.stringify(data.toolCall));
            const names = data.toolCall.functionCalls?.map(f => f.name).join(', ') || 'desconocida';
            setMessages(prev => [...prev, { role: 'ai', text: `🔧 Ejecutando: ${names}...` }]);
          }

        } catch {
          console.log('Mensaje no-JSON:', event.data);
        }
      };

      ws.onerror = () => {
        console.error('WebSocket Error');
      };

      ws.onclose = () => {
        if (isCancelled) return;
        console.log('WebSocket cerrado. Reintentando en 3s...');
        setConnectionStatus('error');
        reconnectTimeout = setTimeout(connect, 3000);
      };
    };

    connect();

    return () => {
      isCancelled = true;
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (ws && ws.readyState === WebSocket.OPEN) ws.close();
    };
  }, [isAuthenticated]);

  // Enviar texto via realtimeInput (formato que acepta el modelo nativo de audio)
  const sendTextMessage = () => {
    const text = textInput.trim();
    if (!text || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

    setMessages(prev => [...prev, { role: 'user', text }]);
    setTextInput('');

    // realtimeInput con texto — la forma correcta de enviar texto al modelo Live
    const msg = {
      clientContent: {
        turns: [{ role: 'user', parts: [{ text }] }],
        turnComplete: true
      }
    };
    wsRef.current.send(JSON.stringify(msg));
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendTextMessage();
    }
  };

  const toggleRecording = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };
  const statusConfig = {
    connecting: { label: 'Conectando...', color: '#f59e0b' },
    ready: { label: 'Live API Conectada', color: '#10b981' },
    error: { label: 'Desconectado (reintentando...)', color: '#ef4444' }
  };
  const status = statusConfig[connectionStatus];
  if (isAuthLoading) {
    return (
      <div className="app-container">
        <div className="loading-container">
          <p>Verificando sesión...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      <header>
        <h1>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
            <polyline points="22,6 12,13 2,6"></polyline>
          </svg>
          Gmail Assistant
        </h1>
        
        <div className="header-actions">
          {isAuthenticated && (
            <div className="status-badge" style={{ color: status.color }}>
              <span className="status-dot" style={{ backgroundColor: status.color }}></span>
              {status.label}
            </div>
          )}
          
          {isAuthenticated ? (
            <button className="auth-btn logout-btn" onClick={handleLogout}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                <polyline points="16 17 21 12 16 7"></polyline>
                <line x1="21" y1="12" x2="9" y2="12"></line>
              </svg>
              Cerrar Sesión
            </button>
          ) : (
            <button className="auth-btn" onClick={handleLogin}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"></path>
                <polyline points="10 17 15 12 10 7"></polyline>
                <line x1="15" y1="12" x2="3" y2="12"></line>
              </svg>
              Conectar Google
            </button>
          )}
        </div>
      </header>

      {isAuthenticated ? (
        <>
          <div className="chat-area">
            {messages.map((msg, index) => (
              <div key={index} className={`message ${msg.role}`}>
                {msg.text}
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>

          <div className="controls">
            {isRecording && (
              <div className="volume-meter" style={{
                position: 'absolute',
                top: '-4px',
                left: '24px',
                right: '24px',
                height: '4px',
                background: 'rgba(255, 255, 255, 0.1)',
                borderRadius: '2px',
                overflow: 'hidden'
              }}>
                <div className="volume-bar" style={{
                  height: '100%',
                  width: `${Math.min(100, volume * 400)}%`,
                  background: 'var(--primary-color)',
                  boxShadow: '0 0 8px var(--primary-color)',
                  transition: 'width 0.1s ease'
                }}></div>
              </div>
            )}
            <input
              type="text"
              className="text-input"
              placeholder={connectionStatus === 'ready' ? 'Escribe un mensaje...' : 'Esperando conexión...'}
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={connectionStatus !== 'ready'}
            />
            <button
              className="send-btn"
              onClick={sendTextMessage}
              disabled={connectionStatus !== 'ready' || !textInput.trim()}
              aria-label="Enviar mensaje"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
              </svg>
            </button>
            <button 
              className={`mic-btn ${isRecording ? 'recording' : ''}`}
              onClick={toggleRecording}
              disabled={connectionStatus !== 'ready'}
              aria-label={isRecording ? 'Detener grabación' : 'Iniciar grabación'}
            >
              <svg className="mic-icon" viewBox="0 0 24 24">
                {isRecording ? (
                  <path d="M6 6h12v12H6z" />
                ) : (
                  <path d="M12 14c1.66 0 2.99-1.34 2.99-3L15 5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z" />
                )}
              </svg>
            </button>
          </div>
        </>
      ) : (
        <div className="auth-container">
          <div className="auth-card">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--primary-color)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
              <polyline points="22,6 12,13 2,6"></polyline>
            </svg>
            <h2>Asistente de Gmail por Voz</h2>
            <p>
              Para comenzar a gestionar tus correos por voz o chat de forma inteligente, primero debes conectar tu cuenta de Gmail de manera segura.
            </p>
            <button className="google-btn" onClick={handleLogin}>
              <svg className="google-icon" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" strokeLinecap="round" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
              </svg>
              Conectar con Google
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
