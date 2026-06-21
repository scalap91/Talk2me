'use client';

import { memo } from 'react';
import { motion } from 'framer-motion';
import { Plus } from 'lucide-react';
import CardActionsBar from '@/components/cards/CardActionsBar';
import PostChrome from '@/components/feed/PostChrome';
import { useLongPress } from '@/components/cards/CardLongPressMenu';
import YouTubeMiniCard from '@/components/feed/YouTubeMiniCard';

interface CardAuthorView {
  id: string;
  display_name: string | null;
  username: string;
  avatar_url: string | null;
}

interface Props {
  card: {
    id: string;
    user_id?: string;
    media_url: string | null;
    caption: string | null;
    likes: number;
    views: number;
    createdAt?: number;
    created_at?: number;
    comment_count?: number;
    author?: CardAuthorView | null;
    attached_audio_json?: string | null;
    attached_product_json?: string | null;
  };
  cardKind?: 'direct_card';
  isOwner?: boolean;
  initialLikedByMe?: boolean;
  onLongPress?: () => void;
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

function parseCaption(caption: string | null): {
  title: string;
  description: string;
  hashtags: string;
  tags: string;
} {
  if (!caption) return { title: '', description: '', hashtags: '', tags: '' };
  const lines = caption.split('\n');
  const title = lines[0] || '';
  const rest = lines.slice(1);
  const hashtagLines: string[] = [];
  const tagLines: string[] = [];
  const descLines: string[] = [];
  for (const line of rest) {
    const trimmed = line.trim();
    if (trimmed.startsWith('#')) {
      hashtagLines.push(trimmed);
    } else if (trimmed.startsWith('@')) {
      tagLines.push(trimmed);
    } else if (trimmed) {
      descLines.push(trimmed);
    }
  }
  return {
    title,
    description: descLines.join('\n'),
    hashtags: hashtagLines.join(' '),
    tags: tagLines.join(' '),
  };
}

function safeJsonParse<T>(json: string | null | undefined): T | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

interface ProductCardData {
  title: string;
  price_label?: string;
  image_url?: string;
  source?: string;
  source_url?: string;
  kind?: string; // 'article' → CTA « Lire sur <source> » (jamais d'URL affichée)
}

interface UnifiedCard {
  id?: string;
  title?: string;
  thumbnail_url?: string;
  meta?: Record<string, unknown>;
}

function ImageCardDisplay({
  card,
  cardKind = 'direct_card',
  isOwner = false,
  initialLikedByMe = false,
  onLongPress,
  fullScreen = false,
}: Props) {
  const ts = card.createdAt ?? card.created_at ?? Date.now();
  const lp = useLongPress(() => onLongPress?.());

  const parsed = parseCaption(card.caption);
  const product = safeJsonParse<ProductCardData>(card.attached_product_json);
  const audio = safeJsonParse<UnifiedCard>(card.attached_audio_json);
  const sonVideoId = (audio?.meta as { youtube_video_id?: string } | undefined)?.youtube_video_id;
  const sonCover = audio?.thumbnail_url || (sonVideoId ? `https://i.ytimg.com/vi/${sonVideoId}/hqdefault.jpg` : null);

  const hasSon = audio && audio.title;
  const hasProduct = !!product;
  // Card de marque presse (Onyx…) → charte éditoriale (Playfair + rouge #cc0000),
  // miroir du site source. AUCUN violet. Pascal 2026-06-10.
  const isArticle = hasProduct && product!.kind === 'article';

  if (fullScreen) {
    return (
      <motion.div
        {...lp.bind}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.25 }}
        className="relative w-full h-full bg-black overflow-hidden select-none"
        data-testid={`image-card-${card.id}`}
      >
        {/* MÉDIA plein cadre */}
        {card.media_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={card.media_url}
            alt={card.caption || 'ImageCard'}
            className="absolute inset-0 w-full h-full object-cover"
            draggable={false}
          />
        )}

        {/* OVERLAY HAUT — TITRE. Article presse = charte éditoriale Onyx (Playfair + kicker rouge) ;
            sinon titre standard centré (composer WYSIWYG). */}
        {parsed.title && (
          isArticle ? (
            <div className="absolute inset-x-0 top-0 z-10 px-5 pt-[calc(env(safe-area-inset-top)+5rem)] pb-7 flex flex-col items-start text-left bg-gradient-to-b from-black/80 via-black/40 to-transparent">
              <span className="mb-2.5 inline-flex items-center gap-2 font-[family-name:var(--font-kicker)] uppercase">
                <span className="px-2 py-[3px] bg-[#cc0000] text-white text-[12px] font-bold tracking-[0.14em] leading-none">{product!.source || 'Onyx'}</span>
                <span className="text-white/85 text-[12px] font-semibold tracking-[0.18em]">Actualités</span>
              </span>
              <p className="w-full text-white font-[family-name:var(--font-editorial)] font-bold text-[26px] leading-[1.15] drop-shadow-lg">{parsed.title}</p>
            </div>
          ) : (
            <div className="absolute inset-x-0 top-0 z-10 px-6 pt-[calc(env(safe-area-inset-top)+6rem)] pb-6 flex flex-col items-center text-center bg-gradient-to-b from-black/60 via-black/20 to-transparent">
              <p className="w-full text-white text-2xl font-semibold leading-snug whitespace-pre-wrap drop-shadow-lg">{parsed.title}</p>
            </div>
          )
        )}

        {/* OVERLAY BAS */}
        <div className="absolute bottom-0 inset-x-0 z-10 p-3 pb-4 space-y-2.5 bg-gradient-to-t from-black/85 via-black/45 to-transparent">
          {/* DESCRIPTION (gauche, 3 lignes) + HASHTAGS (gauche) — juste au-dessus
              des icônes, comme dans le composer WYSIWYG (Pascal 2026-06-09). */}
          {parsed.description && (
            <p className="text-[15px] text-white text-left leading-snug whitespace-pre-line line-clamp-3 drop-shadow">{parsed.description}</p>
          )}
          {parsed.hashtags && (
            <p className="text-[14px] text-red-300 font-medium text-left drop-shadow">{parsed.hashtags}</p>
          )}

          {/* SON attaché → card compacte 80px avec VIGNETTE (aperçu) + lien YouTube
              officiel. Pascal : « la carte 80px c'est bon ». Conforme (pas de
              lecteur caché). */}
          {hasSon && sonVideoId && (
            <YouTubeMiniCard videoId={sonVideoId} title={audio!.title!} thumbnail={sonCover} />
          )}

          {parsed.tags && (
            <p className="text-[13px] text-sky-300/90 drop-shadow">{parsed.tags}</p>
          )}

          {/* ARTICLE — CTA charte Onyx (rouge #cc0000, jamais d'URL brute, jamais de violet) */}
          {isArticle && (
            <div className="flex">
              <a
                href={product!.source_url || '#'}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full bg-[#cc0000] rounded-[10px] px-4 py-3 flex items-center justify-center gap-2 font-[family-name:var(--font-kicker)] text-[15px] font-bold uppercase tracking-[0.1em] text-white shadow-lg shadow-black/40 active:scale-[0.98] transition"
              >
                <span>Lire {product!.source ? `sur ${product!.source}` : "l'article"}</span>
                <span aria-hidden>→</span>
              </a>
            </div>
          )}

          {/* PRODUIT — pleine largeur (le SON est désormais au-dessus, compact) */}
          {hasProduct && product!.kind !== 'article' && (
            <div className="flex">
                <a
                  href={product!.source_url ? `${product!.source_url}${card.user_id || card.author?.id ? `?t2m_ref=${card.user_id || card.author?.id}` : ''}` : '#'}
                  target="_blank"
                  rel="noopener noreferrer sponsored"
                  className="w-full bg-black/45 backdrop-blur rounded-2xl border border-red-400/30 px-2 py-2 flex items-center gap-2.5 active:scale-[0.98] transition"
                >
                  <span className="relative w-[56px] aspect-[3/4] rounded-lg overflow-hidden bg-white/10 shrink-0 flex items-center justify-center">
                    {product!.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={product!.image_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <svg className="w-5 h-5 text-red-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z" />
                        <line x1="3" y1="6" x2="21" y2="6" />
                        <path d="M16 10a4 4 0 01-8 0" />
                      </svg>
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] font-semibold text-red-100">Produit</div>
                    <div className="text-[11px] text-white/90 line-clamp-2 mt-0.5">{product!.title}</div>
                    {product!.price_label && (
                      <div className="text-[11px] text-red-200/90 font-semibold mt-0.5">{product!.price_label}</div>
                    )}
                    {product!.source && (
                      <div className="text-[10px] text-red-300/70 mt-0.5">Voir sur {product!.source} ›</div>
                    )}
                  </div>
                </a>
            </div>
          )}

          {/* Chrome commun : bulle auteur + barre d'actions (source unique PostChrome) */}
          <PostChrome author={card.author} cardKind={cardKind} cardId={card.id} likes={card.likes} views={card.views} commentCount={card.comment_count ?? 0} initialLikedByMe={initialLikedByMe} isOwner={isOwner} />
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

      {/* ARTICLE — CTA charte Onyx (rouge #cc0000, jamais d'URL brute, jamais de violet) */}
      {isArticle && (
        <a
          href={product!.source_url || '#'}
          target="_blank"
          rel="noopener noreferrer"
          className="w-full bg-[#cc0000] rounded-[10px] px-4 py-2.5 flex items-center justify-center gap-2 font-[family-name:var(--font-kicker)] text-[14px] font-bold uppercase tracking-[0.1em] text-white active:scale-[0.98] transition"
        >
          <span>Lire {product!.source ? `sur ${product!.source}` : "l'article"}</span>
          <span aria-hidden>→</span>
        </a>
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

export default memo(ImageCardDisplay);
