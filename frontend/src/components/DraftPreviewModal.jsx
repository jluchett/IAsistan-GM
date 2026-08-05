import React, { useState, useEffect } from 'react';

export function DraftPreviewModal({ isOpen, onClose, draftData, onSend, onSaveDraft }) {
  if (!isOpen || !draftData) return null;

  const [to, setTo] = useState(draftData.destinatario || '');
  const [subject, setSubject] = useState(draftData.asunto || '');
  const [body, setBody] = useState(draftData.cuerpo || '');
  const [isSending, setIsSending] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');

  useEffect(() => {
    setTo(draftData.destinatario || '');
    setSubject(draftData.asunto || '');
    setBody(draftData.cuerpo || '');
    setStatusMsg('');
  }, [draftData]);

  const handleSend = async () => {
    setIsSending(true);
    setStatusMsg('Enviando correo...');
    try {
      await onSend({ to, subject, body });
      setStatusMsg('¡Correo enviado con éxito! 🚀');
      setTimeout(() => {
        setIsSending(false);
        onClose();
      }, 1200);
    } catch (err) {
      console.error(err);
      setStatusMsg('Error al enviar el correo.');
      setIsSending(false);
    }
  };

  const handleSave = async () => {
    setIsSending(true);
    setStatusMsg('Guardando borrador...');
    try {
      await onSaveDraft({ to, subject, body });
      setStatusMsg('¡Borrador guardado! 💾');
      setTimeout(() => {
        setIsSending(false);
        onClose();
      }, 1200);
    } catch (err) {
      console.error(err);
      setStatusMsg('Error al guardar borrador.');
      setIsSending(false);
    }
  };

  return (
    <div style={styles.overlay}>
      <div style={styles.card}>
        <div style={styles.header}>
          <span style={styles.badge}>
            {draftData.action === 'enviado' ? '📤 CORREO REDACTADO' : '📝 BORRADOR INTERACTIVO'}
          </span>
          <button style={styles.closeBtn} onClick={onClose} disabled={isSending}>✕</button>
        </div>

        <h2 style={styles.title}>Previsualización del Correo</h2>
        <p style={styles.subtitle}>Revisa y edita los campos antes de confirmar el envío.</p>

        <div style={styles.formGroup}>
          <label style={styles.label}>Para (Destinatario):</label>
          <input
            type="email"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            style={styles.input}
            placeholder="ejemplo@correo.com"
            disabled={isSending}
          />
        </div>

        <div style={styles.formGroup}>
          <label style={styles.label}>Asunto:</label>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            style={styles.input}
            placeholder="Asunto del correo"
            disabled={isSending}
          />
        </div>

        <div style={styles.formGroup}>
          <label style={styles.label}>Mensaje / Cuerpo:</label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            style={styles.textarea}
            rows={7}
            disabled={isSending}
          />
        </div>

        {statusMsg && <div style={styles.statusText}>{statusMsg}</div>}

        <div style={styles.footer}>
          <button style={styles.secondaryBtn} onClick={handleSave} disabled={isSending}>
            💾 Guardar Borrador
          </button>
          <button style={styles.primaryBtn} onClick={handleSend} disabled={isSending || !to}>
            🚀 Enviar Ahora
          </button>
        </div>
      </div>
    </div>
  );
}

const styles = {
  overlay: {
    position: 'fixed',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(10, 14, 23, 0.85)',
    backdropFilter: 'blur(12px)',
    zIndex: 9999,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '20px'
  },
  card: {
    background: 'linear-gradient(145deg, rgba(20, 26, 40, 0.98), rgba(12, 16, 26, 0.98))',
    border: '1px solid rgba(0, 242, 254, 0.3)',
    boxShadow: '0 0 40px rgba(0, 242, 254, 0.25)',
    borderRadius: '24px',
    width: '100%',
    maxWidth: '650px',
    padding: '28px',
    display: 'flex',
    flexDirection: 'column',
    color: '#e2e8f0',
    fontFamily: 'Inter, system-ui, sans-serif'
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '10px'
  },
  badge: {
    fontSize: '0.75rem',
    fontWeight: '800',
    letterSpacing: '1.5px',
    color: '#00f2fe',
    textTransform: 'uppercase'
  },
  closeBtn: {
    background: 'transparent',
    border: 'none',
    color: '#94a3b8',
    fontSize: '1.2rem',
    cursor: 'pointer'
  },
  title: {
    fontSize: '1.5rem',
    fontWeight: '800',
    margin: '4px 0 2px',
    color: '#ffffff'
  },
  subtitle: {
    fontSize: '0.85rem',
    color: '#94a3b8',
    marginBottom: '20px'
  },
  formGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    marginBottom: '14px'
  },
  label: {
    fontSize: '0.8rem',
    fontWeight: '700',
    color: '#cbd5e1'
  },
  input: {
    background: 'rgba(255, 255, 255, 0.05)',
    border: '1px solid rgba(255, 255, 255, 0.12)',
    borderRadius: '10px',
    padding: '10px 14px',
    color: '#ffffff',
    fontSize: '0.9rem',
    outline: 'none'
  },
  textarea: {
    background: 'rgba(255, 255, 255, 0.05)',
    border: '1px solid rgba(255, 255, 255, 0.12)',
    borderRadius: '10px',
    padding: '12px 14px',
    color: '#ffffff',
    fontSize: '0.9rem',
    outline: 'none',
    resize: 'vertical'
  },
  statusText: {
    fontSize: '0.85rem',
    fontWeight: '700',
    color: '#00f2fe',
    textAlign: 'center',
    margin: '6px 0 12px'
  },
  footer: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '12px',
    marginTop: '10px'
  },
  secondaryBtn: {
    background: 'rgba(255, 255, 255, 0.08)',
    border: '1px solid rgba(255, 255, 255, 0.15)',
    color: '#e2e8f0',
    borderRadius: '12px',
    padding: '10px 20px',
    fontSize: '0.88rem',
    fontWeight: '700',
    cursor: 'pointer'
  },
  primaryBtn: {
    background: 'linear-gradient(90deg, #00f2fe, #4facfe)',
    color: '#0f172a',
    border: 'none',
    borderRadius: '12px',
    padding: '10px 24px',
    fontSize: '0.88rem',
    fontWeight: '800',
    cursor: 'pointer',
    boxShadow: '0 0 15px rgba(0, 242, 254, 0.4)'
  }
};
