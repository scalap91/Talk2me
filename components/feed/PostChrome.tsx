'use client';

/* eslint-disable @next/next/no-img-element */
/**
 * Talk2Me — PostChrome (Pascal 2026-06-15, P1 matrice de post).
 * Le CHROME commun à TOUS les posts : bulle auteur (tap → ajouter) + barre
 * d'actions (like / commentaire / partage / enregistrer / vues). Source UNIQUE,
 * utilisée par chaque type d'affichage (image, vidéo, texte, post, vitrine, salle).
 * Avant : ce bloc était dupliqué 4× → divergences. Maintenant : 1 composant.
 */

import { Plus } from '@/lib/icons';
import CardActionsBar from '@/components/cards/CardActionsBar';

type ChromeAuthor = { avatar_url?: string | null; display_name?: string | null; username?: string } | null | undefined;

function initial(a: ChromeAuthor): string {
  const src = (a?.display_name || a?.username || '?').trim();
  return (src[0] || '?').toUpperCase();
}

export default function PostChrome({
  author, cardKind, cardId, likes, views, commentCount, initialLikedByMe, isOwner,
}: {
  author: ChromeAuthor;
  cardKind: 'post' | 'direct_card';
  cardId: string;
  likes: number;
  views: number;
  commentCount: number;
  initialLikedByMe: boolean;
  isOwner: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); if (!isOwner && author) window.dispatchEvent(new CustomEvent('ttm:connect:open', { detail: author })); }}
        className="relative shrink-0 active:scale-95"
        aria-label={isOwner ? 'Auteur (toi)' : "Voir / ajouter l'auteur"}
      >
        <span className="block w-10 h-10 rounded-full overflow-hidden border-[2.5px] border-white/80 bg-black/30">
          {author?.avatar_url
            ? <img src={author.avatar_url} alt="" className="w-full h-full object-cover" draggable={false} />
            : <span className="w-full h-full flex items-center justify-center text-white text-sm font-bold bg-white/15">{initial(author)}</span>}
        </span>
        {/* "+" (ajouter) masqué sur MON propre post */}
        {!isOwner && (
          <span className="absolute -top-1 -left-1 w-[18px] h-[18px] rounded-full bg-white border-2 border-black flex items-center justify-center">
            <Plus className="w-3 h-3 text-black" strokeWidth={3.2} />
          </span>
        )}
      </button>
      <div className="flex-1 min-w-0">
        <CardActionsBar
          cardKind={cardKind}
          cardId={cardId}
          initialLikes={likes}
          initialViews={views}
          initialCommentCount={commentCount}
          initialLikedByMe={initialLikedByMe}
          isOwner={isOwner}
          variant="overlay"
        />
      </div>
    </div>
  );
}
