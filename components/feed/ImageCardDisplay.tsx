'use client';

import { motion } from 'framer-motion';
import CardActionsBar from '@/components/cards/CardActionsBar';
import { useLongPress } from '@/components/cards/CardLongPressMenu';

interface CardAuthorView {
  id: string;
  display_name: string | null;
  username: string;
  avatar_url: string | null;
}

interface Props {
  card: {
    id: string;
    media_url: string | null;
    caption: string | null;
    likes: number;
    views: number;
    createdAt?: number;
    created_at?: number;
    comment_count?: number;
    /** Talk2Me #378 — auteur public pour le header card. */
    author?: CardAuthorView | null;
  };
  // Lot A
  cardKind?: 'direct_card';
  isOwner?: boolean;
  initialLikedByMe?: boolean;
  onLongPress?: () => void;
  /**
   * Talk2Me #352 — mode TikTok-style sur /home : la card remplit
   * son section parent (viewport - header - bottomnav). Quand absent,
   * fallback "card classique" (utilisé sur /drafts, /profile, etc.).
   */
  fullScreen?: boolean;
}

function formatRelativeTime(ts: number): string {
  const now = Date.now();
  const diff = Math.floor((now - ts) / 1000);
  if (diff < 60) return 'maintenant';
  if (diff < 3600) return `il y a ${Math.floor(diff / 60)}min`;
  if (diff < 86400) return `il y a ${Math.floor(diff / 3600)}h`;
  if (diff < 7 * 86400) return `il y a ${Math.floor(diff / 86400)}j`;
  return Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' }).format(
    new Date(ts)
  );
}

// Talk2Me #378 — display_name → username → "Anonyme".
function authorLabel(a: CardAuthorView | null | undefined): string {
  if (!a) return 'Anonyme';
  if (a.display_name && a.display_name.trim().length > 0) return a.display_name.trim();
  if (a.username && a.username.trim().length > 0) return a.username.trim();
  return 'Anonyme';
}

function authorInitial(a: CardAuthorView | null | undefined): string {
  const label = authorLabel(a);
  return label.charAt(0).toUpperCase() || '?';
}

export default function ImageCardDisplay({
  card,
  cardKind = 'direct_card',
  isOwner = false,
  initialLikedByMe = false,
  onLongPress,
  fullScreen = false,
}: Props) {
  const ts = card.createdAt ?? card.created_at ?? Date.now();
  const lp = useLongPress(() => onLongPress?.());

  if (fullScreen) {
    return (
      <motion.div
        {...lp.bind}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.25 }}
        className="relative w-full h-full bg-black select-none overflow-hidden"
        data-testid={`image-card-${card.id}`}
      >
        {card.media_url && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={card.media_url}
            alt={card.caption || 'ImageCard'}
            className="absolute inset-0 w-full h-full object-cover"
            draggable={false}
          />
        )}

        {/* Header overlay top — Talk2Me #378 dynamique sur card.author */}
        <div className="absolute top-0 inset-x-0 z-10 p-3 flex items-center gap-2 bg-gradient-to-b from-black/55 to-transparent">
          {card.author?.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={card.author.avatar_url}
              alt=""
              className="w-8 h-8 rounded-full object-cover"
              draggable={false}
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-red-500/80 to-red-700/80 flex items-center justify-center text-white text-sm font-bold">
              {authorInitial(card.author)}
            </div>
          )}
          <div className="min-w-0">
            <p className="text-[13px] font-medium text-white/95 truncate">
              {authorLabel(card.author)}
            </p>
            <p className="text-[11px] text-white/60">{formatRelativeTime(ts)}</p>
          </div>
        </div>

        {/* Caption + actions overlay bottom */}
        <div className="absolute bottom-0 inset-x-0 z-10 p-4 pb-5 space-y-3 bg-gradient-to-t from-black/75 via-black/35 to-transparent">
          {card.caption && (
            <p className="text-sm text-white/95 leading-snug line-clamp-3">
              {card.caption}
            </p>
          )}
          <CardActionsBar
            cardKind={cardKind}
            cardId={card.id}
            initialLikes={card.likes}
            initialViews={card.views}
            initialCommentCount={card.comment_count ?? 0}
            initialLikedByMe={initialLikedByMe}
            isOwner={isOwner}
            variant="overlay"
          />
        </div>
      </motion.div>
    );
  }

  // === Fallback : card classique (legacy /drafts, /profile, etc.) ===
  return (
    <motion.div
      {...lp.bind}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="bg-white/[0.04] backdrop-blur-md border border-white/8 rounded-2xl p-3.5 space-y-3 select-none"
      data-testid={`image-card-${card.id}`}
    >
      {/* Header — Talk2Me #378 dynamique sur card.author */}
      <div className="flex items-center gap-2">
        {card.author?.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={card.author.avatar_url}
            alt=""
            className="w-8 h-8 rounded-full object-cover"
            draggable={false}
          />
        ) : (
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-red-500/80 to-red-700/80 flex items-center justify-center text-white text-sm font-bold">
            {authorInitial(card.author)}
          </div>
        )}
        <div>
          <p className="text-[13px] font-medium text-white/85">{authorLabel(card.author)}</p>
          <p className="text-[11px] text-white/45">{formatRelativeTime(ts)}</p>
        </div>
      </div>

      {/* Image full-bleed */}
      {card.media_url && (
        <div className="-mx-3.5 bg-black flex items-center justify-center max-h-[500px] overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={card.media_url}
            alt={card.caption || 'ImageCard'}
            className="w-full max-h-[500px] object-contain"
            draggable={false}
          />
        </div>
      )}

      {/* Caption */}
      {card.caption && (
        <p className="text-sm text-white/85 leading-snug">{card.caption}</p>
      )}

      {/* Lot A — CardActionsBar (❤️ 💬 🔄 📌 👁) */}
      <CardActionsBar
        cardKind={cardKind}
        cardId={card.id}
        initialLikes={card.likes}
        initialViews={card.views}
        initialCommentCount={card.comment_count ?? 0}
        initialLikedByMe={initialLikedByMe}
        isOwner={isOwner}
        variant="glass"
      />
    </motion.div>
  );
}
