import { useState, useEffect, useRef } from 'react';
import './index.css';
import { useAudioCapture } from './hooks/useAudioCapture';

function App() {
  const [messages, setMessages] = useState([
    { role: 'ai', text: '¡Hola! Soy tu asistente de Gmail. Presiona el micrófono para empezar a hablar.' }
  ]);
  const wsRef = useRef(null);
  
  // En fase 1, solo capturamos audio. La lógica de reproducción vendrá en la Fase 2.
  const handleAudioData = (base64Audio) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      // Formato requerido por Gemini Live API a través de nuestro Bridge
      const message = {
        realtimeInput: {
          mediaChunks: [
            {
              mimeType: "audio/pcm;rate=16000",
              data: base64Audio
            }
          ]
        }
      };
      wsRef.current.send(JSON.stringify(message));
    }
  };

  const { isRecording, startRecording, stopRecording } = useAudioCapture(handleAudioData);

  useEffect(() => {
    // Conectar al WebSocket Bridge del Backend
    wsRef.current = new WebSocket('ws://localhost:3000');
    
    wsRef.current.onopen = () => {
      console.log('Conectado al servidor WebSocket local');
    };

    wsRef.current.onmessage = (event) => {
      // Aquí recibiremos las respuestas de Gemini (Audio/Texto/Function calls)
      console.log('Mensaje recibido de Gemini (vía backend):', event.data);
    };

    wsRef.current.onerror = (error) => {
      console.error('WebSocket Error:', error);
    };

    return () => {
      if (wsRef.current) wsRef.current.close();
    };
  }, []);

  const toggleRecording = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

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
        <div style={{fontSize: '0.875rem', color: 'var(--text-muted)'}}>Live API Connected</div>
      </header>

      <div className="chat-area">
        {messages.map((msg, index) => (
          <div key={index} className={`message ${msg.role}`}>
            {msg.text}
          </div>
        ))}
      </div>

      <div className="controls">
        <button 
          className={`mic-btn ${isRecording ? 'recording' : ''}`}
          onClick={toggleRecording}
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
    </div>
  );
}

export default App;
