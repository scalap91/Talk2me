'use client';

/* eslint-disable @next/next/no-img-element */
/**
 * Talk2Me — PostChrome (Pascal 2026-06-15, P1 matrice de post).
 * Le CHROME commun à TOUS les posts : bulle auteur (tap → ajouter) + barre
 * d'actions (like / commentaire / partage / enregistrer / vues). Source UNIQUE,
 * utilisée par chaque type d'affichage (image, vidéo, texte, post, vitrine, salle).
 * Avant : ce bloc était dupliqué 4× → divergences. Maintenant : 1 composant.
 */

import CardActionsBar from '@/components/cards/CardActionsBar';
import UserAvatar from '@/components/user/UserAvatar';

type ChromeAuthor = { avatar_url?: string | null; display_name?: string | null; username?: string } | null | undefined;

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
      {/* Bulle auteur → Discovery (source unique UserAvatar). Cf. « CABLE TOUTES LES BULLES ». */}
      <UserAvatar
        username={author?.username}
        avatarUrl={author?.avatar_url}
        displayName={author?.display_name}
        size={40}
        className="border-[2.5px] border-white/80"
      />
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
