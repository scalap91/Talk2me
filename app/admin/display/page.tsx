'use client';

/**
 * Talk2Me — Admin · Mode d'affichage (Design system, Pascal 2026-07-06).
 * Par section : Carte | Photo. + raccourci global. Le Feed est branché (pilote) ;
 * les autres sections stockent le choix, branchées au fur et à mesure (rollout).
 */
import { useState, useEffect, useCallback } from 'react';

type Mode = 'cards' | 'photo';
const SECTIONS: { k: string; l: string; live?: boolean }[] = [
  { k: 'feed', l: 'Feed / Hub', live: true },
  { k: 'annonces', l: 'Annonces' },
  { k: 'eat', l: 'Eat' },
  { k: 'boutique', l: 'Boutiques' },
  { k: 'service', l: 'Services' },
  { k: 'discussions', l: 'Discussions' },
  { k: 'profil', l: 'Profil' },
  { k: 'card', l: 'Card / Music' },
  { k: 'drive', l: 'Drive' },
];

export default function AdminDisplayPage() {
  const [modes, setModes] = useState<Record<string, Mode>>({});
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    fetch('/api/admin/display-mode', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d) => setModes(d.modes || {}))
      .catch((e) => setErr(e === 403 ? 'Accès réservé au super-admin.' : 'Erreur de chargement.'));
  }, []);

  const apply = useCallback(async (body: object, ok: string) => {
    setErr('');
    try {
      const r = await fetch('/api/admin/display-mode', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const d = await r.json();
      if (d.modes) { setModes(d.modes); setMsg(ok); setTimeout(() => setMsg(''), 1500); }
      else setErr(d.error || 'Erreur');
    } catch { setErr('Erreur réseau'); }
  }, []);

  const seg = (active: boolean): React.CSSProperties => ({
    flex: 1, padding: '9px 0', border: 'none', cursor: 'pointer', borderRadius: 10, fontWeight: 700, fontSize: 13,
    background: active ? 'var(--t2m-primary, #FF7F11)' : 'var(--t2m-wash, #F5F6F8)',
    color: active ? '#fff' : 'var(--t2m-ink-2, #6A7585)',
  });

  return (
    <main style={{ maxWidth: 560, margin: '0 auto', padding: '28px 18px 60px', fontFamily: 'system-ui,sans-serif', color: 'var(--t2m-ink,#2F343A)' }}>
      <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>Mode d’affichage</h1>
      <p style={{ color: 'var(--t2m-ink-2,#6A7585)', fontSize: 14, marginTop: 6 }}>
        Chaque page en <b>Carte</b> ou <b>Photo</b>. Le Feed est actif (pilote) ; les autres se branchent au fil du rollout.
      </p>

      {err && <div style={{ background: 'rgba(239,68,68,.1)', color: '#EF4444', padding: '10px 14px', borderRadius: 10, fontSize: 14, marginTop: 12 }}>{err}</div>}

      <div style={{ display: 'flex', gap: 10, margin: '18px 0' }}>
        <button type="button" onClick={() => apply({ all: 'cards' }, 'Tout en Carte')} style={{ ...seg(false), border: '1px solid var(--t2m-line,#E7EAF0)', flex: 1 }}>🃏 Tout Carte</button>
        <button type="button" onClick={() => apply({ all: 'photo' }, 'Tout en Photo')} style={{ ...seg(false), border: '1px solid var(--t2m-line,#E7EAF0)', flex: 1 }}>📸 Tout Photo</button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {SECTIONS.map((s) => (
          <div key={s.k} style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#fff', border: '1px solid var(--t2m-line,#E7EAF0)', borderRadius: 14, padding: '12px 14px' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{s.l}</div>
              <div style={{ fontSize: 11, color: s.live ? '#10B981' : 'var(--t2m-ink-3,#9DAAB7)' }}>{s.live ? '● branché' : '○ bientôt'}</div>
            </div>
            <div style={{ display: 'flex', gap: 6, width: 180 }}>
              <button type="button" style={seg(modes[s.k] !== 'photo')} onClick={() => apply({ section: s.k, mode: 'cards' }, `${s.l} → Carte`)}>Carte</button>
              <button type="button" style={seg(modes[s.k] === 'photo')} onClick={() => apply({ section: s.k, mode: 'photo' }, `${s.l} → Photo`)}>Photo</button>
            </div>
          </div>
        ))}
      </div>

      {msg && <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: 'var(--t2m-ink,#2F343A)', color: '#fff', padding: '10px 18px', borderRadius: 999, fontSize: 14, fontWeight: 600 }}>{msg}</div>}
    </main>
  );
}
