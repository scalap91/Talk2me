'use client';

/**
 * GlobalBackChip — filet de sécurité de navigation (Pascal 2026-06-29).
 * Le bouton retour Android ne navigue pas (APK = wrapper sans plugin back natif),
 * et certaines pages n'ont pas de bouton retour → on se retrouve COINCÉ.
 * Ce chip flottant apparaît sur toutes les pages SAUF les onglets principaux
 * (qui ont la barre du bas) et les pages qui gèrent déjà leur retour. Tap = retour
 * (règle d'or : jamais la conv IA, repli sur le feed).
 */
import { usePathname } from 'next/navigation';
import { ArrowLeft } from '@/lib/icons';
import { goBack } from '@/lib/client/go-back';

// Pages qui ONT déjà la barre du bas ou leur propre retour → pas de chip.
const HIDDEN_EXACT = new Set(['/', '/home', '/shop', '/decouvrir']);
// '/shop' inclus : les pages Shop ont ShopNav (haut) + BottomNav (bas), le chip ferait doublon.
const HIDDEN_PREFIX = ['/friends', '/drafts', '/profile', '/schema', '/shop', '/drive', '/card', '/b', '/u'];

export default function GlobalBackChip() {
  const pathname = usePathname();
  if (!pathname) return null;
  if (HIDDEN_EXACT.has(pathname)) return null;
  if (HIDDEN_PREFIX.some((p) => pathname === p || pathname.startsWith(p + '/'))) return null;

  return (
    <button
      type="button"
      onClick={() => goBack()}
      aria-label="Retour"
      data-testid="global-back-chip"
      className="md:hidden fixed left-2 z-[90] w-10 h-10 rounded-full bg-black/55 backdrop-blur-md border border-white/15 text-white grid place-items-center active:scale-95 shadow-lg"
      style={{ top: 'calc(env(safe-area-inset-top) + 8px)' }}
    >
      <ArrowLeft className="w-5 h-5" />
    </button>
  );
}
