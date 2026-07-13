'use client';

/**
 * Mode développeur SUR chaque card (Pascal 2026-07-03).
 * Quand le mode dev est ON, chaque card affiche « 🔍 dev » → ouvre son `.card` brut
 * (lu via /api/card-file/<id>) + téléchargement. « Le moteur crée, tu lis. »
 * Le mode se toggle et persiste (localStorage), réactif via un event.
 */
import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { MagnifyingGlass } from '@phosphor-icons/react';

const KEY = 't2m_dev_mode';

export function getDevMode(): boolean {
  try { return typeof window !== 'undefined' && localStorage.getItem(KEY) === '1'; } catch { return false; }
}
export function setDevMode(on: boolean): void {
  try { localStorage.setItem(KEY, on ? '1' : '0'); window.dispatchEvent(new Event('t2m-devmode')); } catch { /* */ }
}
export function useDevMode(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    setOn(getDevMode());
    const h = () => setOn(getDevMode());
    window.addEventListener('t2m-devmode', h);
    window.addEventListener('storage', h);
    return () => { window.removeEventListener('t2m-devmode', h); window.removeEventListener('storage', h); };
  }, []);
  return on;
}

// L'outil dev est réservé ADMIN. On mémorise la réponse (1 seul /api/auth/me pour toute la page).
let adminCache: boolean | null = null;
export function useIsAdmin(): boolean {
  const [admin, setAdmin] = useState<boolean>(adminCache ?? false);
  useEffect(() => {
    if (adminCache !== null) { setAdmin(adminCache); return; }
    let alive = true;
    fetch('/api/auth/me', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => { adminCache = !!d?.user?.is_admin_capable; if (alive) setAdmin(adminCache); })
      .catch(() => { adminCache = false; });
    return () => { alive = false; };
  }, []);
  return admin;
}

export default function CardDevButton({ cardId, className, icon, iconSize = 22 }: { cardId: string; className?: string; icon?: boolean; iconSize?: number }) {
  const dev = useDevMode();
  const admin = useIsAdmin();
  const [open, setOpen] = useState(false);
  const [raw, setRaw] = useState<string | null>(null);
  const [loc, setLoc] = useState<string | null>(null);

  const load = useCallback(async () => {
    setOpen(true);
    if (raw === null) {
      try {
        const res = await fetch('/api/card-file/' + cardId, { cache: 'no-store' });
        setLoc(res.headers.get('X-Card-Location') || (res.ok ? '?' : 'introuvable'));
        setRaw(await res.text());
      } catch {
        setRaw('(erreur de lecture)');
      }
    }
  }, [cardId, raw]);

  if (!admin || !dev || !cardId) return null;

  return (
    <>
      {icon ? (
        // Mode ICÔNE : loupe ORANGE intégrée dans la rangée sociale (Pascal 2026-07-12), à gauche de « Voir ».
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); e.preventDefault(); load(); }}
          className={className}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--t2m-primary)' }}
          title="Inspecter le .card"
          aria-label="Inspecter"
        >
          <MagnifyingGlass size={iconSize} weight="regular" />
        </button>
      ) : (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); e.preventDefault(); load(); }}
          className={className}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 800,
            background: 'rgba(10,10,14,.72)', color: '#7cffa4', border: '1px solid rgba(124,255,164,.4)',
            borderRadius: 999, padding: '4px 9px', cursor: 'pointer', backdropFilter: 'blur(6px)',
            fontFamily: 'ui-monospace,Menlo,monospace',
          }}
          title="Inspecter le .card de cette card"
        >
          🔍 dev
        </button>
      )}

      {open && typeof document !== 'undefined' && createPortal(
        <div
          onClick={() => setOpen(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 2147483000, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ width: '100%', maxWidth: 560, maxHeight: '85dvh', background: '#0b0c10', border: '1px solid #262a35', borderRadius: '18px 18px 0 0', display: 'flex', flexDirection: 'column', fontFamily: 'ui-monospace,Menlo,monospace' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderBottom: '1px solid #1c1f28' }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: '#e7eaf0' }}>🔍 .card</span>
              <span style={{ fontSize: 11, color: '#6b7280' }}>{cardId.slice(0, 12)}…</span>
              <a
                href={'/api/card-file/' + cardId + '?download=1'}
                download={cardId + '.card'}
                style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, color: '#7cffa4', textDecoration: 'none' }}
              >
                ⬇ télécharger
              </a>
              <button type="button" onClick={() => setOpen(false)} style={{ background: 'transparent', border: 'none', color: '#8b93a7', fontSize: 18, cursor: 'pointer', lineHeight: 1 }}>✕</button>
            </div>
            <div style={{ padding: '7px 14px', borderBottom: '1px solid #1c1f28', fontSize: 11, color: '#7cffa4' }}>📁 stockée : {loc ?? '…'}</div>
            <pre style={{ margin: 0, padding: 14, overflow: 'auto', fontSize: 11.5, lineHeight: 1.55, color: '#c8d0e0', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {raw ?? 'lecture du .card…'}
            </pre>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
