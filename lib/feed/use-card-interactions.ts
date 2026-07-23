'use client';
/**
 * useCardInteractions — interactions RÉELLES d'une carte du feed, EXTRAITES d'AlignedPostCard
 * pour être partagées par le peintre unique (PlanCard). Même API, même comportement :
 *   like    → POST/DELETE /api/cards/[id]/like?kind=
 *   comment → event global ttm:comments:open (CommentsHost)
 *   share   → navigator.share (repli presse-papier)
 * Source unique des interactions → web et natif convergent sans dupliquer la logique.
 */
import { useState, useCallback } from 'react';

export type CardKind = 'post' | 'direct_card';

export function useCardInteractions(
  id: string,
  kind: CardKind,
  opts: { liked0?: boolean; likes0?: number } = {},
) {
  const [liked, setLiked] = useState(!!opts.liked0);
  const [likes, setLikes] = useState(opts.likes0 ?? 0);
  const [busy, setBusy] = useState(false);

  const toggleLike = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    const next = !liked;
    setLiked(next); setLikes((n) => n + (next ? 1 : -1)); // optimiste
    try {
      const res = await fetch(`/api/cards/${encodeURIComponent(id)}/like?kind=${kind}`, { method: next ? 'POST' : 'DELETE' });
      const d = await res.json().catch(() => null);
      if (d && typeof d.likes === 'number') setLikes(d.likes);
      if (d && typeof d.liked === 'boolean') setLiked(d.liked);
    } catch {
      setLiked(!next); setLikes((n) => n + (next ? -1 : 1)); // rollback
    } finally { setBusy(false); }
  }, [busy, liked, id, kind]);

  const openComments = useCallback(() => {
    window.dispatchEvent(new CustomEvent('ttm:comments:open', { detail: { kind, id } }));
  }, [kind, id]);

  const share = useCallback(async () => {
    const url = `${location.origin}/home`;
    try {
      const nav = navigator as Navigator & { share?: (d: { url: string; title?: string }) => Promise<void> };
      if (nav.share) await nav.share({ url, title: 'T2M' });
      else await navigator.clipboard?.writeText(url);
    } catch { /* annulé */ }
  }, []);

  return { liked, likes, busy, toggleLike, openComments, share };
}
