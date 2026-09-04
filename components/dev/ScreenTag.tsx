'use client';
// ÉTIQUETTE REPÈRE (Pascal 2026-09-04) — badge fixe en haut à gauche affichant la ROUTE courante
// sur CHAQUE écran web. Sert à identifier les « flashs » (quel écran s'insère entre deux). Comme il
// est monté dans le layout racine, il persiste à travers les navigations et se met à jour tout seul.
import { usePathname } from 'next/navigation';

function label(path: string): string {
  if (!path || path === '/') return 'ROOT';
  // /c/abc → C · /friends/add → FRIENDS/ADD · /u/pseudo → U · etc. (segments dynamiques masqués)
  const parts = path.split('/').filter(Boolean).map((s) => (/^[0-9a-f-]{6,}$/i.test(s) || s.startsWith('[') ? '…' : s));
  return parts.join('/').toUpperCase().slice(0, 28);
}

export default function ScreenTag() {
  const pathname = usePathname();
  return (
    <div
      aria-hidden
      style={{
        position: 'fixed', top: 6, left: 6, zIndex: 2147483647, pointerEvents: 'none',
        background: 'rgba(0,0,0,0.9)', color: '#00E676', border: '1px solid #00E676',
        borderRadius: 5, padding: '2px 6px', fontSize: 10, fontWeight: 900,
        letterSpacing: 1.2, fontFamily: 'monospace', lineHeight: 1.2,
      }}
    >
      {label(pathname || '')}
    </div>
  );
}
