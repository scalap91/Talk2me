'use client';

/**
 * ThemeSwitcher — le « changement en un clic » (Pascal 2026-07-06).
 * Pilote 2 axes du design system, en LIVE, sans rechargement :
 *   • Couleur primaire  → variable --t2m-primary sur <html>
 *   • Mode  Clair/Sombre → <html data-theme="dark">
 * Persisté en localStorage + rejoué au boot (voir le script inline du layout).
 */
import { useEffect, useState } from 'react';
import { Palette, X } from '@phosphor-icons/react';

const COLORS = ['#FF7F11', '#7C5CFF', '#0EA5E9', '#10B981', '#EF4444', '#F43F98', '#111827'];

function apply(k: 'color' | 'mode', v: string) {
  const root = document.documentElement;
  if (k === 'color') { root.style.setProperty('--t2m-primary', v); root.style.setProperty('--t2m-primary-deep', v); root.style.setProperty('--t2m-primary-grad', `linear-gradient(135deg, ${v}, ${v})`); }
  if (k === 'mode') { if (v === 'dark') root.dataset.theme = 'dark'; else delete root.dataset.theme; }
  try { localStorage.setItem(`t2m_${k}`, v); } catch { /* */ }
  window.dispatchEvent(new Event('t2m:theme'));
}

export default function ThemeSwitcher() {
  const [open, setOpen] = useState(false);
  const [color, setColor] = useState('#FF7F11');
  const [mode, setMode] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    try {
      setColor(localStorage.getItem('t2m_color') || '#FF7F11');
      setMode((localStorage.getItem('t2m_mode') as 'light' | 'dark') || 'light');
    } catch { /* */ }
  }, []);

  const seg = (active: boolean): React.CSSProperties => ({
    flex: 1, padding: '9px 0', borderRadius: 10, border: 'none', cursor: 'pointer',
    fontFamily: "'Inter',sans-serif", fontWeight: 700, fontSize: 13,
    background: active ? 'var(--t2m-primary)' : 'var(--t2m-wash)',
    color: active ? '#fff' : 'var(--t2m-ink-2)', transition: 'all .15s',
  });
  const lbl: React.CSSProperties = { fontSize: 11, fontWeight: 700, letterSpacing: '.5px', textTransform: 'uppercase', color: 'var(--t2m-ink-3)', margin: '0 0 8px' };

  return (
    <>
      <button type="button" aria-label="Thème" onClick={() => setOpen((o) => !o)}
        style={{ position: 'fixed', right: 16, bottom: 92, zIndex: 60, width: 46, height: 46, borderRadius: 999, border: 'none', cursor: 'pointer', background: 'var(--t2m-primary-grad)', color: '#fff', display: 'grid', placeItems: 'center', boxShadow: '0 8px 20px rgba(0,0,0,0.22)' }}>
        {open ? <X size={20} weight="bold" /> : <Palette size={22} weight="fill" />}
      </button>

      {open && (
        <div style={{ position: 'fixed', right: 16, bottom: 148, zIndex: 60, width: 268, background: 'var(--t2m-card-bg)', border: '1px solid var(--t2m-line)', borderRadius: 18, boxShadow: '0 16px 40px rgba(0,0,0,0.24)', padding: 18 }}>
          <div style={{ fontFamily: "'Outfit',sans-serif", fontWeight: 800, fontSize: 15, color: 'var(--t2m-ink)', marginBottom: 16 }}>Thème</div>

          <p style={lbl}>Couleur</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 18 }}>
            {COLORS.map((c) => (
              <button key={c} type="button" aria-label={c} onClick={() => { setColor(c); apply('color', c); }}
                style={{ width: 30, height: 30, borderRadius: 999, cursor: 'pointer', background: c, border: color === c ? '3px solid var(--t2m-ink)' : '2px solid var(--t2m-line)' }} />
            ))}
          </div>

          <p style={lbl}>Mode</p>
          <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
            <button type="button" style={seg(mode === 'light')} onClick={() => { setMode('light'); apply('mode', 'light'); }}>☀️ Clair</button>
            <button type="button" style={seg(mode === 'dark')} onClick={() => { setMode('dark'); apply('mode', 'dark'); }}>🌙 Sombre</button>
          </div>

        </div>
      )}
    </>
  );
}
