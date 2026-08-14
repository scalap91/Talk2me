'use client';

import { memo } from 'react';
import { PostTitle, PostMeta } from '@/components/posts/PostText';
import { parseCaption } from '@/lib/posts/parse-caption';
import { motion } from 'framer-motion';
import { Plus } from '@/lib/icons';
import CardActionsBar from '@/components/cards/CardActionsBar';
import PostChrome from '@/components/feed/PostChrome';
import CardDevButton from '@/components/dev/CardDevButton';
import YouTubeMiniCard from '@/components/feed/YouTubeMiniCard';
import { useLongPress } from '@/components/cards/CardLongPressMenu';

/** Musique attachée (UnifiedCard sérialisée) → lecteur, comme sur les cards image/vidéo. */
function parseSon(json: string | null | undefined): { videoId: string | null; title: string; cover: string | null } | null {
  if (!json) return null;
  try {
    const a = JSON.parse(json) as { title?: string; thumbnail_url?: string; meta?: { youtube_video_id?: string } };
    if (!a?.title) return null;
    const videoId = a.meta?.youtube_video_id || null;
    return { videoId, title: a.title, cover: a.thumbnail_url || (videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : null) };
  } catch { return null; }
}

interface CardAuthorView {
  id: string;
  display_name: string | null;
  username: string;
  avatar_url: string | null;
}

interface Props {
  card: {
    id: string;
    text: string | null;
    bg_variant: string | null;
    likes: number;
    views: number;
    createdAt?: number;
    created_at?: number;
    comment_count?: number;
    /** Talk2Me #422 — musique attachée (post "musique seule" ou "texte + musique"). */
    attached_audio_json?: string | null;
    /** Talk2Me #378 — auteur public pour le header card. */
    author?: CardAuthorView | null;
  };
  cardKind?: 'direct_card';
  isOwner?: boolean;
  initialLikedByMe?: boolean;
  onLongPress?: () => void;
  /** Mode TikTok plein viewport (cf. #352). */
  fullScreen?: boolean;
}

const BG_VARIANTS: Record<string, string> = {
  neutral: 'linear-gradient(135deg, #1a1a22 0%, #232330 100%)',
  purple: 'linear-gradient(135deg, #3a1418 0%, #56181f 100%)',
  blue: 'linear-gradient(135deg, #18233a 0%, #213254 100%)',
  warm: 'linear-gradient(135deg, #2a1d20 0%, #3d2530 100%)',
};

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

function TexteCardDisplay({
  card,
  cardKind = 'direct_card',
  isOwner = false,
  initialLikedByMe = false,
  onLongPress,
  fullScreen = false,
}: Props) {
  const variant =
    card.bg_variant && BG_VARIANTS[card.bg_variant]
      ? card.bg_variant
      : 'neutral';
  const ts = card.createdAt ?? card.created_at ?? Date.now();
  const lp = useLongPress(() => onLongPress?.());

  // Parseur UNIQUE (lib/posts/parse-caption.ts) — même racine que les cards image/vidéo.
  const { title: tTitle, description: tDesc, hashtags: tHashtags } = parseCaption(card.text);
  const son = parseSon(card.attached_audio_json);

  if (fullScreen) {
    return (
      <motion.div
        {...lp.bind}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.25 }}
        className="relative w-full h-full overflow-hidden select-none"
        style={{ background: BG_VARIANTS[variant] }}
        data-testid={`texte-card-${card.id}`}
      >
        {card.id && <CardDevButton cardId={card.id} className="absolute right-1.5 top-1.5 z-40" />}
        {/* TITRE en haut (centré) — modèle générique partagé */}
        {tTitle && (
          <div className="absolute inset-x-0 top-0 px-8 pt-[calc(env(safe-area-inset-top)+6rem)] flex flex-col items-center text-center">
            <PostTitle title={tTitle} />
          </div>
        )}

        {/* Bas : description + hashtags (modèle générique) + bulle auteur + actions. */}
        <div className="absolute bottom-0 inset-x-0 z-10 p-4 pb-5 space-y-2 bg-gradient-to-t from-black/55 via-black/25 to-transparent">
          <PostMeta description={tDesc} hashtags={tHashtags} />
          {son && son.videoId && <YouTubeMiniCard videoId={son.videoId} title={son.title} thumbnail={son.cover} />}
          <PostChrome author={card.author} cardKind={cardKind} cardId={card.id} likes={card.likes} views={card.views} commentCount={card.comment_count ?? 0} initialLikedByMe={initialLikedByMe} isOwner={isOwner} />
        </div>
      </motion.div>
    );
  }

  // === Fallback : card classique ===
  return (
    <motion.div
      {...lp.bind}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="relative bg-white/[0.04] backdrop-blur-md border border-white/8 rounded-2xl p-3.5 space-y-3 select-none"
      data-testid={`texte-card-${card.id}`}
    >
      {card.id && <CardDevButton cardId={card.id} className="absolute right-1.5 top-1.5 z-40" />}
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

      {/* Texte sur gradient */}
      <div
        className="rounded-2xl px-6 py-10 min-h-[180px] flex items-center justify-center border border-white/5"
        style={{ background: BG_VARIANTS[variant] }}
      >
        <p className="text-white text-lg font-medium text-center leading-relaxed">
          {card.text}
        </p>
      </div>

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

export default memo(TexteCardDisplay);
