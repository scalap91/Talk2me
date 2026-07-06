'use client';

/**
 * RÈGLE D'OR (Pascal 2026-06-29) : « On arrive par le feed, on sort par le feed. »
 * MODULE UNIQUE du retour. À utiliser pour TOUS les boutons retour.
 *
 *  - `to` fourni  → on va à cette page précise (parent logique).
 *  - sinon        → vrai retour arrière (là d'où on vient)…
 *  - …MAIS JAMAIS sur la conversation IA (`/`) : pas d'historique fiable, ou
 *    retour qui atterrirait sur `/` → on bascule sur le FEED `/home`.
 *
 * Plus aucun bouton retour ne doit coder `href="/"` ni `router.push('/')`.
 */
import { ArrowLeft } from '@/lib/icons';
import { useRouter } from 'next/navigation';

export default function BackButton({
  to,
  label,
  className,
  size = 18,
}: {
  to?: string;
  label?: string;
  className?: string;
  size?: number;
}) {
  const router = useRouter();

  const onClick = () => {
    if (to) { router.push(to); return; }
    if (typeof window === 'undefined' || window.history.length <= 1) {
      router.push('/home');
      return;
    }
    router.back();
    // Garde-fou règle d'or : ne JAMAIS rester sur la conv IA.
    window.setTimeout(() => {
      if (window.location.pathname === '/') router.replace('/home');
    }, 150);
  };

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label || 'Retour'}
      data-testid="back-button"
      className={
        className ??
        'text-white/55 hover:text-white/90 transition-colors inline-flex items-center gap-1.5 text-[13px]'
      }
    >
      <ArrowLeft size={size} />
      {label ? <span>{label}</span> : null}
    </button>
  );
}
