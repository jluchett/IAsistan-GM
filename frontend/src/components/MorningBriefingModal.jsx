import React from 'react';

export function MorningBriefingModal({ isOpen, onClose, briefingData }) {
  if (!isOpen || !briefingData) return null;

  const { fecha, correos = [], eventos = [], noticias = [] } = briefingData;

  return (
    <div style={styles.overlay}>
      <div style={styles.modalCard}>
        <div style={styles.header}>
          <div>
            <span style={styles.badge}>🌅 BRIEFING EJECUTIVO</span>
            <h2 style={styles.title}>Resumen del Día</h2>
            <p style={styles.date}>{fecha}</p>
          </div>
          <button style={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div style={styles.contentGrid}>
          {/* Columna 1: Correos Destacados */}
          <div style={styles.cardSection}>
            <div style={styles.sectionTitle}>
              <span>📧 Correos Recientes</span>
              <span style={styles.countBadge}>{correos.length}</span>
            </div>
            <div style={styles.scrollArea}>
              {correos.length === 0 ? (
                <p style={styles.emptyText}>Sin correos pendientes en el Inbox.</p>
              ) : (
                correos.map((c, i) => (
                  <div key={c.id || i} style={styles.itemCard}>
                    <div style={styles.itemHeader}>
                      <span style={styles.sender}>{c.remitente || 'Desconocido'}</span>
                      {!c.leido && <span style={styles.unreadDot} title="No leído" />}
                    </div>
                    <div style={styles.subject}>{c.asunto || 'Sin asunto'}</div>
                    <div style={styles.snippet}>{c.contenido_recortado}</div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Columna 2: Eventos del Día */}
          <div style={styles.cardSection}>
            <div style={styles.sectionTitle}>
              <span>📅 Agenda de Hoy</span>
              <span style={styles.countBadge}>{eventos.length}</span>
            </div>
            <div style={styles.scrollArea}>
              {eventos.length === 0 ? (
                <p style={styles.emptyText}>No tienes reuniones agendadas para hoy.</p>
              ) : (
                eventos.map((e, i) => (
                  <div key={e.id || i} style={styles.eventCard}>
                    <div style={styles.eventTime}>
                      {e.inicio ? new Date(e.inicio).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Todo el día'}
                    </div>
                    <div style={styles.eventTitle}>{e.titulo || 'Evento'}</div>
                    {e.descripcion && <div style={styles.eventDesc}>{e.descripcion}</div>}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Columna 3: Titulares Tecnológicos */}
          <div style={styles.cardSection}>
            <div style={styles.sectionTitle}>
              <span>🌐 Actualidad & Noticias</span>
              <span style={styles.countBadge}>{noticias.length}</span>
            </div>
            <div style={styles.scrollArea}>
              {noticias.length === 0 ? (
                <p style={styles.emptyText}>Cargando titulares...</p>
              ) : (
                noticias.slice(0, 4).map((n, i) => (
                  <a key={i} href={n.link} target="_blank" rel="noreferrer" style={styles.newsCard}>
                    <div style={styles.newsTitle}>{n.title}</div>
                    <div style={styles.newsSnippet}>{n.snippet}</div>
                  </a>
                ))
              )}
            </div>
          </div>
        </div>

        <div style={styles.footer}>
          <button style={styles.actionBtn} onClick={onClose}>
            Entendido, Cerrar Dashboard
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
    padding: '20px',
    animation: 'fadeIn 0.3s ease-out'
  },
  modalCard: {
    background: 'linear-gradient(145deg, rgba(20, 26, 40, 0.95), rgba(12, 16, 26, 0.98))',
    border: '1px solid rgba(0, 231, 255, 0.3)',
    boxShadow: '0 0 40px rgba(0, 231, 255, 0.2), inset 0 0 20px rgba(0, 231, 255, 0.05)',
    borderRadius: '24px',
    width: '100%',
    maxWidth: '1050px',
    maxHeight: '90vh',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    color: '#e2e8f0',
    fontFamily: 'Inter, system-ui, sans-serif'
  },
  header: {
    padding: '24px 32px 16px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderBottom: '1px solid rgba(255, 255, 255, 0.08)'
  },
  badge: {
    display: 'inline-block',
    fontSize: '0.75rem',
    fontWeight: '700',
    letterSpacing: '1.5px',
    color: '#00f2fe',
    textTransform: 'uppercase',
    marginBottom: '6px'
  },
  title: {
    fontSize: '1.8rem',
    fontWeight: '800',
    margin: 0,
    background: 'linear-gradient(90deg, #ffffff, #4facfe)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent'
  },
  date: {
    margin: '4px 0 0',
    fontSize: '0.9rem',
    color: '#94a3b8',
    textTransform: 'capitalize'
  },
  closeBtn: {
    background: 'rgba(255, 255, 255, 0.06)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    color: '#94a3b8',
    borderRadius: '50%',
    width: '36px',
    height: '36px',
    fontSize: '1.1rem',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.2s'
  },
  contentGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
    gap: '20px',
    padding: '24px 32px',
    overflowY: 'auto',
    flex: 1
  },
  cardSection: {
    background: 'rgba(255, 255, 255, 0.03)',
    borderRadius: '16px',
    padding: '16px',
    border: '1px solid rgba(255, 255, 255, 0.06)',
    display: 'flex',
    flexDirection: 'column'
  },
  sectionTitle: {
    fontSize: '1.05rem',
    fontWeight: '700',
    color: '#f8fafc',
    marginBottom: '14px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  countBadge: {
    background: 'rgba(0, 242, 254, 0.15)',
    color: '#00f2fe',
    borderRadius: '12px',
    padding: '2px 8px',
    fontSize: '0.8rem',
    fontWeight: '700'
  },
  scrollArea: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    overflowY: 'auto',
    maxHeight: '340px',
    paddingRight: '4px'
  },
  emptyText: {
    fontSize: '0.85rem',
    color: '#64748b',
    fontStyle: 'italic',
    textAlign: 'center',
    margin: '20px 0'
  },
  itemCard: {
    background: 'rgba(255, 255, 255, 0.04)',
    borderRadius: '12px',
    padding: '12px 14px',
    borderLeft: '3px solid #00f2fe'
  },
  itemHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '4px'
  },
  sender: {
    fontSize: '0.8rem',
    fontWeight: '600',
    color: '#cbd5e1'
  },
  unreadDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    backgroundColor: '#00f2fe',
    boxShadow: '0 0 8px #00f2fe'
  },
  subject: {
    fontSize: '0.9rem',
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: '4px'
  },
  snippet: {
    fontSize: '0.78rem',
    color: '#94a3b8',
    lineHeight: '1.3',
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden'
  },
  eventCard: {
    background: 'rgba(255, 255, 255, 0.04)',
    borderRadius: '12px',
    padding: '12px 14px',
    borderLeft: '3px solid #a855f7'
  },
  eventTime: {
    fontSize: '0.75rem',
    fontWeight: '700',
    color: '#c084fc',
    marginBottom: '2px'
  },
  eventTitle: {
    fontSize: '0.9rem',
    fontWeight: '700',
    color: '#ffffff'
  },
  eventDesc: {
    fontSize: '0.78rem',
    color: '#94a3b8',
    marginTop: '4px'
  },
  newsCard: {
    textDecoration: 'none',
    background: 'rgba(255, 255, 255, 0.04)',
    borderRadius: '12px',
    padding: '12px 14px',
    borderLeft: '3px solid #3b82f6',
    transition: 'background 0.2s'
  },
  newsTitle: {
    fontSize: '0.85rem',
    fontWeight: '700',
    color: '#93c5fd',
    marginBottom: '4px'
  },
  newsSnippet: {
    fontSize: '0.78rem',
    color: '#94a3b8',
    lineHeight: '1.3'
  },
  footer: {
    padding: '16px 32px',
    borderTop: '1px solid rgba(255, 255, 255, 0.08)',
    display: 'flex',
    justifyContent: 'flex-end',
    background: 'rgba(0, 0, 0, 0.2)'
  },
  actionBtn: {
    background: 'linear-gradient(90deg, #00f2fe, #4facfe)',
    color: '#0f172a',
    border: 'none',
    borderRadius: '12px',
    padding: '10px 24px',
    fontSize: '0.9rem',
    fontWeight: '800',
    cursor: 'pointer',
    boxShadow: '0 0 15px rgba(0, 242, 254, 0.4)',
    transition: 'transform 0.2s'
  }
};
