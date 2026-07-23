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
    const binaryStr = atob(base64Data);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
    const int16 = new Int16Array(bytes.buffer);
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) float32[i] = int16[i] / 32768;
    const audioBuffer = audioCtx.createBuffer(1, float32.length, 24000);
    audioBuffer.getChannelData(0).set(float32);
    const source = audioCtx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioCtx.destination);
    const now = audioCtx.currentTime;
    if (nextStartTime < now) nextStartTime = now;
    source.start(nextStartTime);
    nextStartTime += audioBuffer.duration;
  };

  const stop = () => { nextStartTime = 0; };
  return { play, stop };
}

// Formatea la hora actual HH:MM
function nowTime() {
  return new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: true });
}

// Chips de sugerencia rápida
const SUGGESTIONS = [
  '📧 ¿Cuáles son mis correos nuevos?',
  '📰 Dame un resumen de hoy',
  '📅 Agenda una reunión',
  '🌐 ¿Qué noticias hay hoy?',
];

function App() {
  const [messages, setMessages] = useState([
    {
      role: 'ai',
      text: '¡Hola! Soy Leda, tu asistente de Gmail. Puedo leer tus correos, redactar respuestas, buscar en internet y agendar reuniones. ¿En qué te ayudo?',
      time: nowTime(),
    }
  ]);
  const [connectionStatus, setConnectionStatus] = useState('connecting');
  const [textInput, setTextInput] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [isTyping, setIsTyping] = useState(false);
  const wsRef = useRef(null);
  const chatEndRef = useRef(null);
  const audioPlayerRef = useRef(createAudioPlayer());
  const typingTimerRef = useRef(null);

  // Scroll automático
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  // Chequear autenticación al montar
  useEffect(() => {
    const checkAuthStatus = async () => {
      const params = new URLSearchParams(window.location.search);
      if (params.get('auth') === 'success') {
        setIsAuthenticated(true);
        setIsAuthLoading(false);
        window.history.replaceState({}, document.title, window.location.pathname);
        return;
      }
      try {
        const res = await fetch('http://localhost:5000/auth/status');
        const data = await res.json();
        setIsAuthenticated(data.authenticated);
      } catch (err) {
        console.error('Error verificando autenticación:', err);
      } finally {
        setIsAuthLoading(false);
      }
    };
    checkAuthStatus();
  }, []);

  const handleLogin = () => { window.location.href = 'http://localhost:5000/auth/google'; };

  const handleLogout = async () => {
    try {
      const res = await fetch('http://localhost:5000/auth/logout', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setIsAuthenticated(false);
        setConnectionStatus('connecting');
        if (wsRef.current) wsRef.current.close();
      }
    } catch (err) {
      console.error('Error al cerrar sesión:', err);
    }
  };

  // Audio capture
  const [volume, setVolume] = useState(0);

  const handleAudioData = useCallback((base64Audio) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        realtimeInput: { audio: { data: base64Audio, mimeType: 'audio/pcm;rate=16000' } }
      }));
    }
  }, []);

  const handleRecordingStop = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ realtimeInput: { audioStreamEnd: true } }));
    }
  }, []);

  const { isRecording, startRecording, stopRecording } = useAudioCapture(handleAudioData, handleRecordingStop, setVolume);

  // WebSocket al backend
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
        console.log('WS conectado');
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.type === 'setup_complete') {
            setConnectionStatus('ready');
            return;
          }
          if (data.type === 'error') {
            setConnectionStatus('error');
            return;
          }
          if (data.type === 'gemini_disconnected') {
            setConnectionStatus('error');
            return;
          }

          // Audio
          if (data.serverContent?.modelTurn?.parts) {
            for (const part of data.serverContent.modelTurn.parts) {
              if (part.inlineData?.data) audioPlayerRef.current.play(part.inlineData.data);
              if (part.text) setMessages(prev => [...prev, { role: 'ai', text: part.text, time: nowTime() }]);
            }
          }

          // Transcripción de respuesta AI
          if (data.serverContent?.outputTranscription?.text) {
            const transcript = data.serverContent.outputTranscription.text;
            // Mostrar typing y luego acumular
            clearTimeout(typingTimerRef.current);
            setIsTyping(false);
            setMessages(prev => {
              const last = prev[prev.length - 1];
              if (last?.role === 'ai' && last.isTranscript) {
                const updated = [...prev];
                updated[updated.length - 1] = { ...last, text: last.text + transcript };
                return updated;
              }
              return [...prev, { role: 'ai', text: transcript, isTranscript: true, time: nowTime() }];
            });
          }

          // Transcripción de usuario
          if (data.serverContent?.inputTranscription?.text) {
            const userText = data.serverContent.inputTranscription.text;
            setMessages(prev => {
              const last = prev[prev.length - 1];
              if (last?.role === 'user' && last.isTranscript) {
                const updated = [...prev];
                updated[updated.length - 1] = { ...last, text: last.text + userText };
                return updated;
              }
              return [...prev, { role: 'user', text: userText, isTranscript: true, time: nowTime() }];
            });
            // Mostrar typing indicator cuando el usuario habla
            setIsTyping(true);
            clearTimeout(typingTimerRef.current);
            typingTimerRef.current = setTimeout(() => setIsTyping(false), 8000);
          }

          if (data.serverContent?.turnComplete) {
            setIsTyping(false);
            clearTimeout(typingTimerRef.current);
          }

          if (data.serverContent?.interrupted) {
            audioPlayerRef.current.stop();
            setIsTyping(false);
          }

          if (data.toolCall) {
            const names = data.toolCall.functionCalls?.map(f => f.name).join(', ') || '…';
            setMessages(prev => [...prev, { role: 'tool', text: names, time: nowTime() }]);
            setIsTyping(true);
            clearTimeout(typingTimerRef.current);
            typingTimerRef.current = setTimeout(() => setIsTyping(false), 12000);
          }

        } catch {
          /* no-json */
        }
      };

      ws.onerror = () => console.error('WS Error');
      ws.onclose = () => {
        if (isCancelled) return;
        setConnectionStatus('error');
        reconnectTimeout = setTimeout(connect, 3000);
      };
    };

    connect();
    return () => {
      isCancelled = true;
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (ws?.readyState === WebSocket.OPEN) ws.close();
    };
  }, [isAuthenticated]);

  const sendTextMessage = (customText) => {
    const text = (customText || textInput).trim();
    if (!text || wsRef.current?.readyState !== WebSocket.OPEN) return;
    setMessages(prev => [...prev, { role: 'user', text, time: nowTime() }]);
    setTextInput('');
    setIsTyping(true);
    clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => setIsTyping(false), 10000);
    wsRef.current.send(JSON.stringify({
      clientContent: { turns: [{ role: 'user', parts: [{ text }] }], turnComplete: true }
    }));
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendTextMessage(); }
  };

  const toggleRecording = () => { isRecording ? stopRecording() : startRecording(); };

  const statusInfo = {
    connecting: { label: 'Conectando…',       cls: 'connecting' },
    ready:      { label: 'Conectada',          cls: '' },
    error:      { label: 'Reconectando…',      cls: 'error' },
  }[connectionStatus];

  // ─── LOADING ───────────────────────────────────────────────────
  if (isAuthLoading) {
    return (
      <div className="app-shell">
        <div className="loading-screen">
          <div className="loading-spinner" />
          <p className="loading-text">Cargando…</p>
        </div>
      </div>
    );
  }

  // ─── AUTH ──────────────────────────────────────────────────────
  if (!isAuthenticated) {
    return (
      <div className="app-shell">
        <div className="auth-screen">
          <div className="auth-logo-wrap">
            {/* Envelope icon */}
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
              <polyline points="22,6 12,13 2,6"/>
            </svg>
          </div>

          <h1 className="auth-title">Hola, soy Leda</h1>
          <p className="auth-subtitle">
            Tu asistente de Gmail con inteligencia artificial. Gestiona tus correos por voz.
          </p>

          <div className="auth-features">
            <div className="feature-pill">🎤 Voz natural</div>
            <div className="feature-pill">📧 Lee correos</div>
            <div className="feature-pill">✍️ Redacta</div>
            <div className="feature-pill">📅 Calendar</div>
            <div className="feature-pill">🌐 Web search</div>
          </div>

          <button className="google-btn" onClick={handleLogin} id="connect-google-btn">
            <svg className="google-icon" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
            </svg>
            Conectar con Google
          </button>
        </div>
      </div>
    );
  }

  // ─── CHAT PRINCIPAL ────────────────────────────────────────────
  return (
    <div className="app-shell">
      {/* HEADER */}
      <header className="app-header">
        <div className="header-brand">
          <div className="leda-avatar-sm">L</div>
          <div className="header-title-group">
            <span className="header-title">Leda</span>
            <span className={`header-subtitle ${statusInfo.cls}`}>
              <span className="status-dot-inline" />
              {statusInfo.label}
            </span>
          </div>
        </div>

        <div className="header-actions">
          <button
            className="icon-btn danger"
            onClick={handleLogout}
            title="Cerrar sesión"
            id="logout-btn"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16 17 21 12 16 7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
          </button>
        </div>
      </header>

      {/* CHAT */}
      <div className="chat-area" id="chat-area">
        {messages.length <= 1 && (
          <div className="empty-chat">
            <div className="empty-chat-icon">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              </svg>
            </div>
            <p className="empty-chat-title">Dile hola a Leda</p>
            <p className="empty-chat-sub">Escribe un mensaje o usa el micrófono para hablar</p>
          </div>
        )}

        {messages.map((msg, i) => {
          if (msg.role === 'tool') {
            return (
              <div key={i} className="msg-group ai" style={{ paddingLeft: '36px' }}>
                <div className="bubble tool">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14"/>
                  </svg>
                  Ejecutando: {msg.text.split(',').map(n => n.trim()).join(' · ')}
                </div>
              </div>
            );
          }

          if (msg.role === 'ai') {
            return (
              <div key={i} className="msg-group ai">
                <div className="msg-row">
                  <div className="msg-avatar">L</div>
                  <div className="bubble ai">{msg.text}</div>
                </div>
                {msg.time && <span className="msg-time" style={{ paddingLeft: '36px' }}>{msg.time}</span>}
              </div>
            );
          }

          // user
          return (
            <div key={i} className="msg-group user">
              <div className="bubble user">{msg.text}</div>
              {msg.time && <span className="msg-time">{msg.time}</span>}
            </div>
          );
        })}

        {/* Typing indicator */}
        {isTyping && (
          <div className="msg-group ai">
            <div className="msg-row">
              <div className="msg-avatar">L</div>
              <div className="bubble ai" style={{ padding: '10px 16px' }}>
                <div className="typing-indicator">
                  <span /><span /><span />
                </div>
              </div>
            </div>
          </div>
        )}

        <div ref={chatEndRef} />
      </div>

      {/* SUGGESTION CHIPS (solo cuando no hay muchos mensajes) */}
      {messages.length <= 1 && connectionStatus === 'ready' && (
        <div className="suggestions">
          {SUGGESTIONS.map((s, i) => (
            <button
              key={i}
              className="suggestion-chip"
              onClick={() => sendTextMessage(s.replace(/^[^\s]+\s/, ''))}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* BARRA DE CONTROLES */}
      <div className="controls-bar">
        {/* Volume indicator */}
        {isRecording && (
          <div className="volume-track">
            <div className="volume-fill" style={{ width: `${Math.min(100, volume * 400)}%` }} />
          </div>
        )}

        <input
          id="text-input"
          type="text"
          className="text-input"
          placeholder={connectionStatus === 'ready' ? 'Escríbele a Leda…' : 'Conectando…'}
          value={textInput}
          onChange={(e) => setTextInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={connectionStatus !== 'ready'}
          autoComplete="off"
        />

        <button
          id="send-btn"
          className="send-btn"
          onClick={() => sendTextMessage()}
          disabled={connectionStatus !== 'ready' || !textInput.trim()}
          aria-label="Enviar mensaje"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
          </svg>
        </button>

        <button
          id="mic-btn"
          className={`mic-btn ${isRecording ? 'recording' : ''}`}
          onClick={toggleRecording}
          disabled={connectionStatus !== 'ready'}
          aria-label={isRecording ? 'Detener grabación' : 'Iniciar grabación'}
        >
          <svg className="mic-icon" viewBox="0 0 24 24">
            {isRecording ? (
              <path d="M6 6h12v12H6z"/>
            ) : (
              <path d="M12 14c1.66 0 2.99-1.34 2.99-3L15 5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z"/>
            )}
          </svg>
        </button>
      </div>
    </div>
  );
}

export default App;
