'use client';

/**
 * SingleSessionGuard — NEUTRALISÉ (Pascal 2026-07-05).
 *
 * L'écran « Talk2Me est ouvert ailleurs — [Utiliser ici] » générait trop
 * d'incompréhension (et bloquait des pages légitimes comme le viewer /live →
 * about:blank). On le rend passthrough : l'app se monte toujours. Si un jour on
 * veut ré-empêcher les doublons de sonnerie, le faire de façon non bloquante
 * (mute des SSE de l'onglet inactif, pas un écran plein qui masque l'app).
 */
export default function SingleSessionGuard({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
