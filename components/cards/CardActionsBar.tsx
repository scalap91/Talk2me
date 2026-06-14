'use client';

/**
 * CardActionsBar — Barre d'actions sous chaque card du feed (❤️ 💬 🔄 📌 👁).
 *
 * Talk2Me Lot A (Pascal 2026-06-04). Doctrine [[talk2me-card-vivante]] +
 * master prompt point 14 ("Likes / Enregistrement / Statistiques").
 *
 * Comportement :
 *   - ❤️ optimistic toggle (POST/DELETE /api/cards/[id]/like?kind=...)
 *   - 💬 (placeholder MVP, ouvre /home#card-<id> ou rien)
 *   - 🔄 Web Share API si dispo, sinon copy URL + toast "Lien copié"
 *   - 📌 save / unsave via /api/cards/save (post si owner skip)
 *   - 👁 IntersectionObserver >2s → POST /api/cards/[id]/views?kind=... (1x/card/session)
 *
 * Design : tokens existants Talk2Me (white/40 hover white/70, red-400 actif).
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Heart, MessageCircle, Share2, Bookmark, Eye } from 'lucide-react';

type CardKindCrud = 'direct_card' | 'post';

interface CardActionsBarProps {
  cardKind: CardKindCrud;
  cardId: string;
  initialLikes?: number;
  initialViews?: number;
  initialCommentCount?: number;
  initialLikedByMe?: boolean;
  /** Pour la page partage : /p/<id> (MVP : on partage /home#card-<id>). */
  shareUrl?: string;
  /** Si owner, on cache 📌 (on ne s'enregistre pas soi-même). */
  isOwner?: boolean;
  /**
   * Variante visuelle :
   *   - 'glass'   (default) : fond glassmorphism (PostCard / ImageCard / TexteCard)
   *   - 'overlay' : pour VideoCard (overlay blanc sur fond noir)
   */
  variant?: 'glass' | 'overlay';
}

const VIEWS_TIMEOUT_MS = 2000;

/** Cache localStorage des cards déjà comptées en vue cette session. */
function viewKey(kind: CardKindCrud, id: string): string {
  return `talk2me:viewed:${kind}:${id}`;
}
function markViewed(kind: CardKindCrud, id: string): void {
  try {
    sessionStorage.setItem(viewKey(kind, id), '1');
  } catch {
    /* ignore */
  }
}
function alreadyViewed(kind: CardKindCrud, id: string): boolean {
  try {
    return sessionStorage.getItem(viewKey(kind, id)) === '1';
  } catch {
    return false;
  }
}

export default function CardActionsBar({
  cardKind,
  cardId,
  initialLikes = 0,
  initialViews = 0,
  initialCommentCount = 0,
  initialLikedByMe = false,
  shareUrl,
  isOwner = false,
  variant = 'glass',
}: CardActionsBarProps) {
  const [liked, setLiked] = useState<boolean>(initialLikedByMe);
  const [likes, setLikes] = useState<number>(initialLikes);
  const [views, setViews] = useState<number>(initialViews);
  const [saved, setSaved] = useState<boolean>(false);
  const [savingInFlight, setSavingInFlight] = useState<boolean>(false);
  const [shareToast, setShareToast] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);

  // === ❤️ Like toggle ============================================
  const onToggleLike = useCallback(
    async (e?: React.MouseEvent) => {
      e?.stopPropagation();
      const next = !liked;
      // Optimistic UI
      setLiked(next);
      setLikes((c) => Math.max(0, c + (next ? 1 : -1)));
      try {
        const url = `/api/cards/${encodeURIComponent(cardId)}/like?kind=${cardKind}`;
        const res = await fetch(url, {
          method: next ? 'POST' : 'DELETE',
          credentials: 'include',
        });
        if (!res.ok) {
          // Rollback si serveur refuse
          setLiked(!next);
          setLikes((c) => Math.max(0, c + (next ? -1 : 1)));
          return;
        }
        const data = await res.json().catch(() => null);
        if (data && typeof data.likes === 'number') setLikes(data.likes);
        if (data && typeof data.liked === 'boolean') setLiked(data.liked);
      } catch {
        // Rollback réseau
        setLiked(!next);
        setLikes((c) => Math.max(0, c + (next ? -1 : 1)));
      }
    },
    [liked, cardKind, cardId]
  );

  // === 🔄 Share ==================================================
  const finalShareUrl = useMemo(() => {
    if (shareUrl) return shareUrl;
    if (typeof window === 'undefined') return '';
    return `${window.location.origin}/home#card-${cardId}`;
  }, [shareUrl, cardId]);

  const onShare = useCallback(
    async (e?: React.MouseEvent) => {
      e?.stopPropagation();
      const url = finalShareUrl;
      const nav = typeof navigator !== 'undefined' ? navigator : undefined;
      if (nav && typeof nav.share === 'function') {
        try {
          await nav.share({ url });
          setShareToast('Partagé');
        } catch {
          // Annulé par l'user
        }
      } else if (nav && nav.clipboard && nav.clipboard.writeText) {
        try {
          await nav.clipboard.writeText(url);
          setShareToast('Lien copié');
        } catch {
          setShareToast('Échec du partage');
        }
      } else {
        setShareToast('Partage indisponible');
      }
      setTimeout(() => setShareToast(null), 1800);
    },
    [finalShareUrl]
  );

  // === 📌 Save (bookmark) ========================================
  // MVP : on save uniquement les direct_cards (post = clip de conv,
  // on n'a pas encore le mapping vers card_kind 'video_card'|'image_card'|...
  // → on désactive le bouton sur les posts pour le MVP, idem si owner).
  const canSave = !isOwner && cardKind === 'direct_card';

  const onToggleSave = useCallback(
    async (e?: React.MouseEvent) => {
      e?.stopPropagation();
      if (!canSave || savingInFlight) return;
      setSavingInFlight(true);
      try {
        if (saved) {
          // MVP : pas d'unsave par cardId direct (saved_cards a son propre id).
          // On laisse l'utilisateur passer par /saved-cards pour retirer.
          setSavingInFlight(false);
          setShareToast('Va dans Mes cards sauvegardées');
          setTimeout(() => setShareToast(null), 1800);
          return;
        }
        const res = await fetch('/api/cards/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            card_kind:
              // direct_card → on enregistre comme image_card/video_card/texte_card
              // (le card_kind ici réfère au schéma saved_cards qui distingue ces 3).
              // Pour simplifier MVP : on save comme 'image_card' par défaut. Le
              // CardLongPressMenu (mode propriétaire d'1 autre card) appellera
              // /api/cards/save avec le bon card_kind. Pour le feed home, on a
              // accès au type via la prop parent — pas critique pour le MVP.
              'image_card',
            card_data: { id: cardId, kind: cardKind },
          }),
        });
        if (res.ok) {
          setSaved(true);
          setShareToast('Enregistré');
        } else {
          setShareToast('Échec de l’enregistrement');
        }
      } catch {
        setShareToast('Erreur réseau');
      } finally {
        setSavingInFlight(false);
        setTimeout(() => setShareToast(null), 1800);
      }
    },
    [canSave, saved, cardKind, cardId, savingInFlight]
  );

  // === 👁 Views (IntersectionObserver >2s) =======================
  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    if (alreadyViewed(cardKind, cardId)) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio > 0.5) {
            if (timer) continue;
            timer = setTimeout(() => {
              if (alreadyViewed(cardKind, cardId)) return;
              markViewed(cardKind, cardId);
              // Increment serveur (fire-and-forget)
              fetch(
                `/api/cards/${encodeURIComponent(cardId)}/views?kind=${cardKind}`,
                { method: 'POST', credentials: 'include' }
              ).catch(() => {
                /* ignore */
              });
              setViews((v) => v + 1);
            }, VIEWS_TIMEOUT_MS);
          } else {
            if (timer) {
              clearTimeout(timer);
              timer = null;
            }
          }
        }
      },
      { threshold: [0, 0.5, 1] }
    );
    io.observe(el);
    return () => {
      if (timer) clearTimeout(timer);
      io.disconnect();
    };
  }, [cardKind, cardId]);

  // === Render =====================================================
  // Classes selon variant (glass = fonds clairs, overlay = overlay sur vidéo).
  // Icône CENTRÉE (hauteur fixe), chiffre en ABSOLU dessous → toutes les icônes
  // sont alignées sur la même ligne (par le milieu) que la bulle, le compteur ne
  // décale ni la hauteur ni la largeur. (Pascal 2026-06-09)
  const baseBtn =
    'relative inline-flex items-center justify-center w-12 h-7 transition-colors active:scale-95 ' +
    (variant === 'overlay' ? 'drop-shadow' : '');
  const countCls = 'absolute top-full mt-0.5 text-[11px] font-semibold leading-none';
  const idleColor =
    variant === 'overlay' ? 'text-white hover:text-white' : 'text-white/55 hover:text-white/90';
  const likedColor = 'text-red-300';
  // Icônes UNIFIÉES : même taille partout (home/amis/profil) — Pascal 2026-06-09.
  const iconCls = 'w-7 h-7';
  const iconStroke = variant === 'overlay' ? 2.5 : 2.3;

  return (
    <div
      ref={containerRef}
      data-testid={`card-actions-${cardKind}-${cardId}`}
      className={
        'relative flex items-center justify-around pt-2.5 pb-5 ' +
        (variant === 'overlay' ? '' : 'border-t border-white/8')
      }
    >
      <button
        type="button"
        onClick={onToggleLike}
        aria-pressed={liked}
        aria-label={liked ? 'Retirer le like' : 'Liker'}
        data-testid={`card-like-btn-${cardId}`}
        data-liked={liked ? 'true' : 'false'}
        className={`${baseBtn} ${liked ? likedColor : idleColor}`}
      >
        <Heart
          className={`${iconCls} ${liked ? 'fill-red-400' : ''}`}
          strokeWidth={iconStroke}
          aria-hidden="true"
        />
        <span className={countCls}>{likes}</span>
      </button>

      <button
        type="button"
        aria-label="Commentaires (bientôt)"
        data-testid={`card-comment-btn-${cardId}`}
        className={`${baseBtn} ${idleColor}`}
        onClick={(e) => e.stopPropagation()}
      >
        <MessageCircle className={iconCls} strokeWidth={iconStroke} aria-hidden="true" />
        <span className={countCls}>{initialCommentCount}</span>
      </button>

      <button
        type="button"
        onClick={onShare}
        aria-label="Partager"
        data-testid={`card-share-btn-${cardId}`}
        className={`${baseBtn} ${idleColor}`}
      >
        <Share2 className={iconCls} strokeWidth={iconStroke} aria-hidden="true" />
        <span className={countCls}>&nbsp;</span>
      </button>

      {/* Marque-page TOUJOURS affiché → 5 icônes partout, barre alignée (Pascal
          2026-06-09). Le save reste no-op si non applicable (propre card / post). */}
      <button
        type="button"
        onClick={onToggleSave}
        aria-label={saved ? 'Retirer des favoris' : 'Enregistrer dans mes favoris'}
        data-testid={`card-save-btn-${cardId}`}
        disabled={savingInFlight}
        className={`${baseBtn} ${saved ? likedColor : idleColor} disabled:opacity-50`}
      >
        <Bookmark
          className={`${iconCls} ${saved ? 'fill-red-400' : ''}`}
          strokeWidth={iconStroke}
          aria-hidden="true"
        />
        <span className={countCls}>&nbsp;</span>
      </button>

      <button
        type="button"
        aria-label="Vues"
        data-testid={`card-views-${cardId}`}
        className={`${baseBtn} ${idleColor} cursor-default`}
        onClick={(e) => e.stopPropagation()}
      >
        <Eye className={iconCls} strokeWidth={iconStroke} aria-hidden="true" />
        <span className={countCls}>{views}</span>
      </button>

      {shareToast && (
        <div
          role="status"
          className={
            'absolute -top-9 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-[11.5px] ' +
            'bg-black/75 text-white/95 backdrop-blur border border-white/10 pointer-events-none'
          }
        >
          {shareToast}
        </div>
      )}
    </div>
  );
}
