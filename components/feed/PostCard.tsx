'use client';

import { motion } from 'framer-motion';
import { useMemo, useState, useRef, useEffect } from 'react';
import MessageBubble from '@/components/chat/MessageBubble';
import EmbedRenderer from '@/components/chat/EmbedRenderer';
import { extractUrls } from '@/lib/url-parser';
import YouTubeEmbed from '@/components/embeds/YouTubeEmbed';
import TikTokEmbed from '@/components/embeds/TikTokEmbed';
import PlaceCard from '@/components/cards/PlaceCard';
import RecipeCard from '@/components/cards/RecipeCard';
import SearchResultCard from '@/components/cards/SearchResultCard';
import ProductCard from '@/components/cards/ProductCard';
import GeolocRequestBubble from '@/components/chat/GeolocRequestBubble';
import CardActionsBar from '@/components/cards/CardActionsBar';
import { useLongPress } from '@/components/cards/CardLongPressMenu';
import type {
  YouTubeCardData,
  PlaceCardData,
  RecipeCardData,
  WebSearchData,
  TikTokCardData,
} from '@/lib/chat-types';

// === Fusion intelligente des slides (#xxx) ===
// Estimation conservatrice de hauteur par type d'élément
// pour décider quand fusionner plusieurs messages sur 1 slide.
const HEIGHT_ESTIMATES = {
  youtube: 360,          // iframe 16:9 + titre + channel + description courte
  tiktok: 580,           // embed officiel TikTok 9:16, ~325px x ~580px
  place: 320,            // photo + nom + addr + actions
  recipe: 280,           // photo + titre + meta
  wikipedia: 220,
  weather: 180,
  web_search_result: 100, // par résultat, max 4 affichés
  product: 260,
  text_short: 60,        // < 80 chars
  text_medium: 100,      // 80-200 chars
  text_long: 160,        // > 200 chars
  geoloc: 140,
  gap_between: 12,       // gap vertical entre éléments d'une même slide
};

// Viewport disponible pour le contenu d'une slide en mode fullScreen.
// S23 FE ~844px : header 56 + bottomnav 64 + actionsbar 40 + dots 24 = ~184
// → ~660px restants. Fallback SSR : 660.
const SSR_FALLBACK_HEIGHT = 660;
const CHROME_HEIGHT = 184;

function estimateMessageHeight(m: {
  content?: string;
  youtube?: YouTubeCardData | null;
  tiktok?: TikTokCardData | null;
  places?: PlaceCardData[] | null;
  recipe?: RecipeCardData | null;
  web_search?: WebSearchData | null;
  requires_geoloc?: boolean;
}): number {
  let h = 0;
  if (m.youtube) h += HEIGHT_ESTIMATES.youtube;
  if (m.tiktok) h += HEIGHT_ESTIMATES.tiktok;
  if (m.places && m.places.length > 0) h += HEIGHT_ESTIMATES.place;
  if (m.recipe) h += HEIGHT_ESTIMATES.recipe;
  if (m.web_search?.results?.length) {
    h += HEIGHT_ESTIMATES.web_search_result * Math.min(4, m.web_search.results.length);
  }
  if (m.requires_geoloc) h += HEIGHT_ESTIMATES.geoloc;
  const txt = m.content?.trim() ?? '';
  if (txt.length > 0) {
    if (txt.length < 80) h += HEIGHT_ESTIMATES.text_short;
    else if (txt.length < 200) h += HEIGHT_ESTIMATES.text_medium;
    else h += HEIGHT_ESTIMATES.text_long;
  }
  return h;
}

const MAX_SLIDES = 6;

function groupMessagesIntoSlides<T extends {
  content?: string;
  youtube?: YouTubeCardData | null;
  tiktok?: TikTokCardData | null;
  places?: PlaceCardData[] | null;
  recipe?: RecipeCardData | null;
  web_search?: WebSearchData | null;
  requires_geoloc?: boolean;
}>(messages: T[], maxHeight: number): T[][] {
  const slides: T[][] = [];
  let current: T[] = [];
  let currentHeight = 0;

  for (const m of messages) {
    const h = estimateMessageHeight(m);
    const withGap = current.length > 0 ? h + HEIGHT_ESTIMATES.gap_between : h;
    if (current.length === 0 || currentHeight + withGap <= maxHeight) {
      current.push(m);
      currentHeight += withGap;
    } else {
      slides.push(current);
      current = [m];
      currentHeight = h;
    }
  }
  if (current.length > 0) slides.push(current);

  // Limite #308 : max 6 slides — fusionne le surplus dans la dernière.
  if (slides.length > MAX_SLIDES) {
    const head = slides.slice(0, MAX_SLIDES - 1);
    const tail = slides.slice(MAX_SLIDES - 1).flat();
    return [...head, tail];
  }
  return slides;
}

interface PostAuthorView {
  id: string;
  display_name: string | null;
  username: string;
  avatar_url: string | null;
}

interface PostCardProps {
  post: {
    id: string;
    createdAt: number;
    likes: number;
    views: number;
    /** Talk2Me #378 — auteur public, header /home. `null` si user supprimé. */
    author?: PostAuthorView | null;
    messages: Array<{
      id: string;
      role: 'user' | 'agent';
      content: string;
      links?: string[];
      youtube?: YouTubeCardData | null;
      tiktok?: TikTokCardData | null;
      timestamp?: number;
      places?: PlaceCardData[] | null;
      recipe?: RecipeCardData | null;
      requires_geoloc?: boolean;
      intent_query?: string | null;
      intent_label_fr?: string | null;
      user_lat?: number | null;
      user_lng?: number | null;
      web_search?: WebSearchData | null;
    }>;
  };
  // Lot A
  cardKind?: 'post';
  isOwner?: boolean;
  initialLikedByMe?: boolean;
  onLongPress?: () => void;
  /** Mode TikTok plein viewport (#352). */
  fullScreen?: boolean;
}

function formatRelativeTime(ts: number): string {
  const now = Date.now();
  const diff = Math.floor((now - ts) / 1000);

  if (diff < 60) return 'il y a quelques secondes';
  if (diff < 3600) return `il y a ${Math.floor(diff / 60)}min`;
  if (diff < 86400) return `il y a ${Math.floor(diff / 3600)}h`;
  if (diff < 7 * 86400) return `il y a ${Math.floor(diff / 86400)}j`;
  return Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' }).format(new Date(ts));
}

// Talk2Me #378 — Résout le label affiché dans le header card.
// Priorité : display_name → username → "Anonyme" (fallback si user supprimé).
function authorLabel(a: PostAuthorView | null | undefined): string {
  if (!a) return 'Anonyme';
  if (a.display_name && a.display_name.trim().length > 0) return a.display_name.trim();
  if (a.username && a.username.trim().length > 0) return a.username.trim();
  return 'Anonyme';
}

// Initiale en majuscule pour l'avatar fallback gradient.
function authorInitial(a: PostAuthorView | null | undefined): string {
  const label = authorLabel(a);
  // T2M Officiel → "T", Pascal → "P", Anonyme → "A".
  return label.charAt(0).toUpperCase() || '?';
}

export default function PostCard({
  post,
  cardKind = 'post',
  isOwner = false,
  initialLikedByMe = false,
  onLongPress,
  fullScreen = false,
}: PostCardProps) {
  const lp = useLongPress(() => onLongPress?.());

  // Hauteur disponible pour 1 slide en fullScreen — recalculée au resize.
  const [slideViewportHeight, setSlideViewportHeight] = useState<number>(SSR_FALLBACK_HEIGHT);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const update = () => {
      const h = Math.max(320, window.innerHeight - CHROME_HEIGHT);
      setSlideViewportHeight(h);
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  // Découpage des slides : fusion intelligente selon l'espace disponible.
  // Ordre chronologique strict, pas de re-shuffle.
  const slides = useMemo(() => {
    return groupMessagesIntoSlides(post.messages, slideViewportHeight);
  }, [post.messages, slideViewportHeight]);

  const [currentSlide, setCurrentSlide] = useState(0);
  const scrollerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const slideWidth = el.clientWidth;
        if (slideWidth <= 0) return;
        const idx = Math.round(el.scrollLeft / slideWidth);
        setCurrentSlide(Math.max(0, Math.min(slides.length - 1, idx)));
      });
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(raf);
    };
  }, [slides.length]);

  // Fonction de rendu des messages
  function renderMessages(msgs: typeof post.messages) {
    return msgs.map((m) => {
      const hasRichCard =
        !!m.recipe ||
        (Array.isArray(m.places) && m.places.length > 0) ||
        (m.youtube !== undefined && m.youtube !== null) ||
        (m.tiktok !== undefined && m.tiktok !== null) ||
        m.requires_geoloc === true ||
        (Array.isArray(m.products) && m.products.length > 0) ||
        (!!m.web_search && Array.isArray(m.web_search.results) && m.web_search.results.length > 0);

      if (hasRichCard) {
        return (
          <div key={m.id} className="space-y-2">
            {/* CARD EN AVANT, full width */}
            {m.youtube && (
              <YouTubeEmbed
                videoId={m.youtube.video_id}
                originalUrl={`https://www.youtube.com/watch?v=${m.youtube.video_id}`}
                rich={{
                  title: m.youtube.title,
                  channel: m.youtube.channel,
                  description: m.youtube.description,
                }}
              />
            )}
            {m.tiktok && (
              // Talk2Me search_tiktok (Pascal 2026-06-04) — vidéo safe filtrée
              // par les 5 garde-fous. Embed officiel tiktok.com/embed.js.
              <TikTokEmbed
                videoId={m.tiktok.video_id}
                user={m.tiktok.user}
                originalUrl={m.tiktok.original_url}
              />
            )}
            {m.recipe && <RecipeCard recipe={m.recipe} />}
            {m.places && m.places.length > 0 && (
              <PlaceCard
                places={m.places}
                intentQuery={m.intent_query ?? undefined}
                userLat={m.user_lat ?? undefined}
                userLng={m.user_lng ?? undefined}
              />
            )}
            {m.web_search && m.web_search.results.length > 0 && (
              <SearchResultCard data={m.web_search} />
            )}
            {Array.isArray(m.products) && m.products.length > 0 && (
              <ProductCard products={m.products} />
            )}
            {m.requires_geoloc && <GeolocRequestBubble />}

            {/* TEXTE SECONDAIRE sous la card */}
            {m.content && m.content.trim().length > 0 && (
              <p className="text-[12px] text-white/55 italic px-1">
                {m.content.trim().length < 60
                  ? m.content.trim()
                  : m.content.trim().slice(0, 60) + '…'}
              </p>
            )}
          </div>
        );
      }

      // Talk2Me #377 (Pascal 2026-06-05) — Si le message est juste un URL
      // (embed pur), on bypass MessageBubble pour rendre l'EmbedRenderer
      // pleine largeur, sans badge You / avatar / wrapper bulle.
      const rawTxt = (m.content || '').trim();
      const inlineUrls = extractUrls(rawTxt);
      const extras = (m.links || []).filter((u) => /^https?:\/\//i.test(u));
      const allUrls = Array.from(new Set([...inlineUrls, ...extras]));
      const isJustEmbed = allUrls.length >= 1 && (allUrls.includes(rawTxt) || rawTxt.length === 0);

      if (isJustEmbed) {
        return (
          <div key={m.id} className="w-full space-y-3">
            {allUrls.map((u, i) => (
              <EmbedRenderer key={`${m.id}-emb-${i}`} url={u} />
            ))}
          </div>
        );
      }

      // Pas de card et pas embed-only : MessageBubble normal
      return (
        <MessageBubble
          key={m.id}
          messageId={m.id}
          role={m.role}
          content={m.content}
          timestamp={m.timestamp}
          extraLinks={m.links}
          youtube={m.youtube}
          places={m.places ?? undefined}
          recipe={m.recipe ?? undefined}
          requires_geoloc={m.requires_geoloc}
          intent_query={m.intent_query ?? undefined}
          user_lat={m.user_lat ?? undefined}
          user_lng={m.user_lng ?? undefined}
          web_search={m.web_search ?? undefined}
        />
      );
    });
  }

  // === MODE FULLSCREEN (TikTok) ===
  if (fullScreen) {
    return (
      <motion.div
        {...lp.bind}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.25 }}
        className="relative w-full h-full bg-[#0a0a0d] flex flex-col select-none overflow-hidden"
        data-testid={`post-card-${post.id}`}
      >
        {/* Header (flex-none) — Talk2Me #378 dynamique sur post.author */}
        <div className="flex-none flex items-center gap-2 px-4 py-3 border-b border-white/5">
          {post.author?.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={post.author.avatar_url}
              alt=""
              className="w-8 h-8 rounded-full object-cover"
              draggable={false}
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-red-500/80 to-red-700/80 flex items-center justify-center text-white text-sm font-bold">
              {authorInitial(post.author)}
            </div>
          )}
          <div className="min-w-0">
            <p className="text-[13px] font-medium text-white/95 truncate">
              {authorLabel(post.author)}
            </p>
            <p className="text-[11px] text-white/55">{formatRelativeTime(post.createdAt)}</p>
          </div>
        </div>

        {/* Body : carrousel ou rendu direct, occupe l'espace restant */}
        <div className="flex-1 min-h-0 overflow-hidden">
          {slides.length === 1 ? (
            <div className="h-full overflow-y-auto scrollbar-none py-3 space-y-3">
              {renderMessages(slides[0])}
            </div>
          ) : (
            <div
              ref={scrollerRef}
              className="slides-container h-full flex overflow-x-auto snap-x snap-mandatory scrollbar-none"
              style={{ scrollSnapType: 'x mandatory' }}
            >
              {slides.map((slideMessages, idx) => (
                <div
                  key={idx}
                  className="slide w-full h-full flex-shrink-0 snap-start overflow-y-auto py-3 space-y-3 scrollbar-none"
                  style={{ scrollSnapAlign: 'start' }}
                >
                  {renderMessages(slideMessages)}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Dots (si multi-slides) */}
        {slides.length > 1 && (
          <div className="flex-none flex gap-1.5 justify-center py-1.5">
            {slides.map((_, idx) => (
              <span
                key={idx}
                className={`w-1.5 h-1.5 rounded-full transition-colors ${
                  idx === currentSlide ? 'bg-red-400' : 'bg-white/20'
                }`}
              />
            ))}
          </div>
        )}

        {/* Footer : CardActionsBar (flex-none) */}
        <div className="flex-none px-4 py-2 border-t border-white/5">
          <CardActionsBar
            cardKind={cardKind}
            cardId={post.id}
            initialLikes={post.likes}
            initialViews={post.views}
            initialCommentCount={0}
            initialLikedByMe={initialLikedByMe}
            isOwner={isOwner}
            variant="glass"
          />
        </div>
      </motion.div>
    );
  }

  // === FALLBACK : card classique ===
  return (
    <motion.div
      {...lp.bind}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="bg-white/[0.04] backdrop-blur-md border border-white/8 rounded-2xl p-3.5 space-y-3 select-none"
      data-testid={`post-card-${post.id}`}
    >
      {/* Header — Talk2Me #378 dynamique sur post.author */}
      <div className="flex items-center gap-2">
        {post.author?.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={post.author.avatar_url}
            alt=""
            className="w-8 h-8 rounded-full object-cover"
            draggable={false}
          />
        ) : (
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-red-500/80 to-red-700/80 flex items-center justify-center text-white text-sm font-bold">
            {authorInitial(post.author)}
          </div>
        )}
        <div>
          <p className="text-[13px] font-medium text-white/85">{authorLabel(post.author)}</p>
          <p className="text-[11px] text-white/45">{formatRelativeTime(post.createdAt)}</p>
        </div>
      </div>

      {/* Body */}
      {slides.length === 1 ? (
        <div className="space-y-3">
          {renderMessages(slides[0])}
        </div>
      ) : (
        <>
          <div
            ref={scrollerRef}
            className="slides-container flex overflow-x-auto snap-x snap-mandatory -mx-3.5 px-3.5 scrollbar-none"
            style={{ scrollSnapType: 'x mandatory' }}
          >
            {slides.map((slideMessages, idx) => (
              <div
                key={idx}
                className="slide w-full flex-shrink-0 snap-start space-y-3 pr-2"
                style={{ scrollSnapAlign: 'start' }}
              >
                {renderMessages(slideMessages)}
              </div>
            ))}
          </div>
          {/* Dots */}
          <div className="dots flex gap-1.5 justify-center mt-2">
            {slides.map((_, idx) => (
              <span
                key={idx}
                className={`w-1.5 h-1.5 rounded-full transition-colors ${
                  idx === currentSlide ? 'bg-red-400' : 'bg-white/20'
                }`}
              />
            ))}
          </div>
        </>
      )}

      {/* Lot A — CardActionsBar (❤️ 💬 🔄 📌 👁) */}
      <div className="mt-2">
        <CardActionsBar
          cardKind={cardKind}
          cardId={post.id}
          initialLikes={post.likes}
          initialViews={post.views}
          initialCommentCount={0}
          initialLikedByMe={initialLikedByMe}
          isOwner={isOwner}
          variant="glass"
        />
      </div>
    </motion.div>
  );
}
