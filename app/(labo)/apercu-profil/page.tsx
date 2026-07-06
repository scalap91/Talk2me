'use client';
/**
 * Aperçu PUBLIC du profil posé (structure Gemini) — URL fraîche pour contourner
 * le cache PWA (Pascal 2026-07-02). Rend EXACTEMENT la structure du vrai
 * app/profile (données mock). À supprimer après validation.
 */
const row: React.CSSProperties = { display: 'flex', alignItems: 'center', padding: '13px 20px', borderBottom: '1px solid #E7EAF0' };
const rowLast: React.CSSProperties = { ...row, borderBottom: 'none' };
const groupCard: React.CSSProperties = { backgroundColor: '#FFFFFF', borderRadius: 18, boxShadow: '0 4px 16px rgba(47,52,58,.06)', marginBottom: 20, padding: '15px 0', overflow: 'hidden' };
const groupTitle: React.CSSProperties = { fontFamily: "'Outfit',sans-serif", fontWeight: 600, fontSize: 18, margin: '0 20px 12px', color: '#2F343A' };
const chev = <span style={{ fontSize: 18, color: '#9DAAB7' }}>›</span>;

export default function ApercuProfil() {
  return (
    <div style={{ minHeight: '100svh', background: '#F5F6F8', color: '#2F343A', fontFamily: "'Inter',sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@600;700&family=Inter:wght@400;500;600&display=swap');`}</style>
      <div style={{ padding: 20, maxWidth: 390, margin: '0 auto', boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 30, paddingTop: 20 }}>
          <div style={{ width: 100, height: 100, borderRadius: '50%', background: 'radial-gradient(circle at 50% 35%,#FFB86B,#FF7F11)', display: 'flex', justifyContent: 'center', alignItems: 'center', marginBottom: 15, boxShadow: '0 0 0 4px rgba(255,127,17,.18)' }}>
            <span style={{ width: 90, height: 90, borderRadius: '50%', border: '2px solid #FFFFFF', display: 'grid', placeItems: 'center', color: '#fff', fontFamily: "'Outfit',sans-serif", fontWeight: 700, fontSize: 34 }}>P</span>
          </div>
          <h1 style={{ fontFamily: "'Outfit',sans-serif", fontWeight: 700, fontSize: 28, margin: '0 0 4px' }}>Pascal</h1>
          <p style={{ fontSize: 15, color: '#6A7585', margin: '0 0 15px' }}>@pascal</p>
          <button style={{ background: 'transparent', border: '1px solid #E7EAF0', borderRadius: 10, padding: '10px 20px', fontSize: 15, color: '#2F343A', fontWeight: 500 }}>Modifier mon profil</button>
        </div>
        <div style={groupCard}>
          <h2 style={groupTitle}>Compte</h2>
          <div style={row}><span style={{ fontSize: 20, marginRight: 15 }}>👤</span><span style={{ flexGrow: 1 }}>Profil &amp; photo</span>{chev}</div>
          <div style={row}><span style={{ fontSize: 20, marginRight: 15 }}>📞</span><span>Téléphone</span><span style={{ flexGrow: 1, textAlign: 'right', color: '#6A7585', marginRight: 10 }}>+261 34 ••</span>{chev}</div>
          <div style={rowLast}><span style={{ fontSize: 20, marginRight: 15 }}>💰</span><span style={{ flexGrow: 1 }}>Wallet T2M</span>{chev}</div>
        </div>
        <div style={groupCard}>
          <h2 style={groupTitle}>Préférences</h2>
          <div style={row}><span style={{ fontSize: 20, marginRight: 15, color: '#7C5CFF' }}>✨</span><span style={{ flexGrow: 1, color: '#7C5CFF' }}>Léa — sa mémoire &amp; mes habitudes</span>{chev}</div>
          <div style={row}><span style={{ fontSize: 20, marginRight: 15 }}>🔔</span><span style={{ flexGrow: 1 }}>Notifications</span><div style={{ width: 40, height: 24, background: '#FF7F11', borderRadius: 12, position: 'relative' }}><div style={{ width: 20, height: 20, background: '#fff', borderRadius: '50%', position: 'absolute', top: 2, right: 2 }} /></div></div>
          <div style={row}><span style={{ fontSize: 20, marginRight: 15 }}>🔒</span><span style={{ flexGrow: 1 }}>Confidentialité</span>{chev}</div>
          <div style={rowLast}><span style={{ fontSize: 20, marginRight: 15 }}>🚫</span><span style={{ flexGrow: 1 }}>Comptes bloqués</span>{chev}</div>
        </div>
        <div style={groupCard}>
          <div style={row}><span style={{ fontSize: 20, marginRight: 15 }}>➡️</span><span style={{ flexGrow: 1 }}>Se déconnecter</span>{chev}</div>
          <div style={rowLast}><span style={{ fontSize: 20, marginRight: 15, color: '#E24C4C' }}>🗑️</span><span style={{ flexGrow: 1, color: '#E24C4C' }}>Supprimer mon compte</span>{chev}</div>
        </div>
      </div>
    </div>
  );
}
