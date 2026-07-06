'use client';
/** Vérif du POSE de conversation.html : le VRAI composant LeaConstellation dans le
 * cadre de la conv (header Léa + bulles + input). Données d'exemple. À supprimer après. */
import LeaConstellation, { type Eclat } from '@/components/conversation/LeaConstellation';

const eclats: Eclat[] = [
  { id: '1', tag: 'RESTO', title: 'Chez Mariette', sub: '🍲 Malgache · 600 m', tone: 'r', x: 8, y: 20, depth: 1.1 },
  { id: '2', tag: 'CINÉ', title: 'Ciné Rex · 20h30', sub: '🎬 Séance ce soir', tone: 'c', x: 180, y: 70, depth: 0.82 },
  { id: '3', tag: 'CONCERT', title: 'Concert · Le Piment', sub: '🎵 Jazz live · 21h', tone: 'u', x: 70, y: 160, depth: 0.95 },
];

export default function ApercuConstel() {
  return (
    <div style={{ height: '100svh', background: '#F5F3F0', color: '#2F343A', fontFamily: "'Inter',sans-serif", position: 'relative', overflow: 'hidden' }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@500;600;700&family=Inter:wght@400;500;600&display=swap');`}</style>
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 20, display: 'flex', alignItems: 'center', gap: 11, padding: '14px 16px 11px', background: 'rgba(255,255,255,.85)', backdropFilter: 'blur(12px)', borderBottom: '1px solid #eee' }}>
        <span style={{ fontSize: 23 }}>‹</span>
        <div style={{ width: 38, height: 38, borderRadius: '50%', background: 'linear-gradient(135deg,#7C5CFF,#5E80FE)', display: 'grid', placeItems: 'center', color: '#fff', fontFamily: "'Outfit',sans-serif", fontWeight: 600, boxShadow: '0 0 0 2px rgba(255,127,17,.5)' }}>L</div>
        <div><div style={{ fontFamily: "'Outfit',sans-serif", fontWeight: 600, fontSize: 16 }}>Léa · ton IA</div><div style={{ fontSize: 11, color: '#FF7F11' }}>en ligne</div></div>
        <div data-hub-target style={{ marginLeft: 'auto', width: 40, height: 40, borderRadius: 12, background: '#fff', border: '1px solid #eee', display: 'grid', placeItems: 'center', fontSize: 18, boxShadow: '0 3px 10px rgba(0,0,0,.06)' }}>◱</div>
      </div>
      <div style={{ position: 'absolute', top: 78, left: 0, right: 0, bottom: 80, overflowY: 'auto', padding: '16px 14px' }}>
        <div style={{ textAlign: 'center', fontSize: 11.5, color: '#6A7585', marginBottom: 12 }}>touche un Éclat pour l'ouvrir · « Garder » l'envoie dans ton Hub</div>
        <div style={{ maxWidth: '80%', marginLeft: 'auto', background: '#FF7F11', color: '#fff', padding: '11px 15px', fontSize: 15, borderRadius: '18px 18px 5px 18px', marginBottom: 10 }}>J'ai faim, trouve-moi un truc pour ce soir 🌙</div>
        <div style={{ maxWidth: '80%', background: '#F0ECFA', border: '1px solid #E4DCFA', padding: '11px 15px', fontSize: 15, borderRadius: '18px 18px 18px 5px', marginBottom: 10 }}><span style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#7C5CFF', marginBottom: 3 }}>✦ Léa</span>J'ai trouvé 3 idées près de toi, à Tana. Regarde ✨</div>
        <LeaConstellation eclats={eclats} onKeep={(e) => console.log('kept', e.id)} />
        <div style={{ maxWidth: '80%', background: '#F0ECFA', border: '1px solid #E4DCFA', padding: '11px 15px', fontSize: 15, borderRadius: '18px 18px 18px 5px' }}><span style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#7C5CFF', marginBottom: 3 }}>✦ Léa</span>Ouvre-en un pour voir, garde ceux qui te plaisent — je les mets dans ton Hub 🌌</div>
      </div>
      <div style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 20, display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'rgba(255,255,255,.9)', backdropFilter: 'blur(10px)', borderTop: '1px solid #eee' }}>
        <span style={{ fontSize: 23, color: '#6A7585' }}>+</span>
        <div style={{ flex: 1, background: '#F5F3F0', border: '1px solid #eee', borderRadius: 999, padding: '11px 16px', color: '#6A7585', fontSize: 14 }}>Réponds à Léa…</div>
        <div style={{ width: 42, height: 42, borderRadius: '50%', background: '#FF7F11', color: '#fff', display: 'grid', placeItems: 'center', fontSize: 17 }}>➤</div>
      </div>
    </div>
  );
}
