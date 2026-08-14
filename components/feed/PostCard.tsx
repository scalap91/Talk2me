'use client';

import { motion } from 'framer-motion';
import { memo, useMemo, useState, useRef, useEffect } from 'react';
import MessageBubble from '@/components/chat/MessageBubble';
import EmbedRenderer from '@/components/chat/EmbedRenderer';
import { extractUrls } from '@/lib/url-parser';
import TikTokEmbed from '@/components/embeds/TikTokEmbed';
import SearchResultCard from '@/components/cards/SearchResultCard';
import ProductCard from '@/components/cards/ProductCard';
import GeolocRequestBubble from '@/components/chat/GeolocRequestBubble';
import { Plus } from '@/lib/icons';
import CardActionsBar from '@/components/cards/CardActionsBar';
import SuperCardView from '@/components/cards/SuperCardView';
import { fromYouTube, fromPlace, fromRecipe } from '@/lib/cards/adapt';
import PostChrome from '@/components/feed/PostChrome';
import CardDevButton from '@/components/dev/CardDevButton';
import { useLongPress } from '@/components/cards/CardLongPressMenu';
import type {
  YouTubeCardData,
  PlaceCardData,
  RecipeCardData,
  WebSearchData,
  TikTokCardData,
  ProductCardData,
} from '@/lib/chat-types';
import { splitIntoSlides } from '@/lib/posts/slides';
import UnifiedBubble from '@/components/conversation/UnifiedBubble';
import type { UnifiedMessage } from '@/components/conversation/types';

// Durée d'affichage d'une slide avant auto-swipe (stories style, Pascal 2026-06-09).
const SLIDE_DURATION_MS = 5000;

// Hauteurs de chrome EN PIXELS (Pascal 2026-06-09) — pour caler le contenu du
// post de façon IDENTIQUE sur toutes les pages, sans qu'il tombe sous le menu.
//  • header + onglets flottants = ChatHeader h-14 (56px) au-dessus de la safe-area
//  • zone barre de progression (sous le header) = 14px
//  • footer auteur + actions (overlay bas) = ~96px
const HEADER_H = 56;               // header/onglets flottants
const PROGRESS_H = 14;             // barre de progression sous le header
const FOOTER_H = 96;               // footer auteur + actions
// Réserve haute = safe-area + header. La barre vient juste dessous, puis le contenu.
const TOP_RESERVE = `calc(env(safe-area-inset-top) + ${HEADER_H}px)`;
const CONTENT_TOP = `calc(env(safe-area-inset-top) + ${HEADER_H + PROGRESS_H + 8}px)`;

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
      products?: ProductCardData[] | null;
      ai_name?: string | null;
      ai_avatar_url?: string | null;
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

// Convertit un message de post en message du VRAI chat (bulles authentiques).
// role 'user' → bulle droite (moi) ; role 'agent' → bulle gauche (le pote).
function toUnifiedMsg(m: PostCardProps['post']['messages'][number]): UnifiedMessage {
  // Léa = l'IA du MAÎTRE → répond du CÔTÉ DROIT (me-ai) avec son badge.
  // (ai_name présent = bulle IA ; sinon role agent = le pote, à gauche.)
  const isAi = !!(m.ai_name && m.ai_name.trim());
  return {
    id: m.id,
    author: m.role === 'user' ? 'me' : (isAi ? 'me-ai' : 'peer'),
    content: m.content || '',
    timestamp: m.timestamp,
    author_name: isAi ? m.ai_name! : undefined,
    author_avatar_url: m.ai_avatar_url ?? undefined,
    youtube: m.youtube ?? null,
    places: m.places ?? null,
    recipe: m.recipe ?? null,
    web_search: m.web_search ?? null,
    requires_geoloc: m.requires_geoloc,
    intent_query: m.intent_query ?? null,
    user_lat: m.user_lat ?? null,
    user_lng: m.user_lng ?? null,
  };
}

function PostCard({
  post,
  cardKind = 'post',
  isOwner = false,
  initialLikedByMe = false,
  onLongPress,
  fullScreen = false,
}: PostCardProps) {
  const lp = useLongPress(() => onLongPress?.());

  // Découpage en slides : SOURCE UNIQUE déterministe (card-based) — le nombre de
  // slides correspond exactement à ce que le composer a annoncé. Plus de calcul
  // par hauteur écran. Ordre chronologique strict.
  const slides = useMemo(() => splitIntoSlides(post.messages), [post.messages]);

  const [currentSlide, setCurrentSlide] = useState(0);
  const [paused, setPaused] = useState(false);
  const [isActive, setIsActive] = useState(false);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // Slide courant déduit du scroll (swipe manuel au doigt).
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const w = el.clientWidth;
        if (w <= 0) return;
        setCurrentSlide(Math.max(0, Math.min(slides.length - 1, Math.round(el.scrollLeft / w))));
      });
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => { el.removeEventListener('scroll', onScroll); cancelAnimationFrame(raf); };
  }, [slides.length]);

  // Va à une slide (scroll programmatique smooth → onScroll met currentSlide à jour).
  const goToSlide = (idx: number) => {
    const el = scrollerRef.current;
    if (!el) { setCurrentSlide(idx); return; }
    el.scrollTo({ left: idx * el.clientWidth, behavior: 'smooth' });
  };

  // Le post n'avance QUE s'il est réellement visible à l'écran (pas en arrière-plan du feed).
  useEffect(() => {
    if (!fullScreen) return;
    const el = rootRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => setIsActive(e.isIntersecting && e.intersectionRatio > 0.6)),
      { threshold: [0, 0.6, 1] }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [fullScreen]);

  // AUTO-SWIPE (stories) : avance seul toutes les SLIDE_DURATION_MS quand le post
  // est visible et non en pause (drag/interaction). S'arrête au dernier slide.
  useEffect(() => {
    if (!fullScreen || slides.length <= 1 || paused || !isActive) return;
    const t = setTimeout(() => {
      // BOUCLE (Pascal 2026-06-10) : après la dernière slide → retour au début, en continu.
      goToSlide((currentSlide + 1) % slides.length);
    }, SLIDE_DURATION_MS);
    return () => clearTimeout(t);
  }, [fullScreen, slides.length, paused, isActive, currentSlide]);

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
            {/* FEED clair (Gemini option A) : cards de Léa via la machine SuperCardView(light) + adapters. */}
            {m.youtube && (
              <SuperCardView card={fromYouTube(m.youtube)} theme="light" variant="social" hideMeta />
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
            {m.recipe && <SuperCardView card={fromRecipe(m.recipe)} theme="light" variant="social" hideMeta />}
            {m.places && m.places.length > 0 && (
              <div className="space-y-2">
                {m.places.map((p, i) => <SuperCardView key={i} card={fromPlace(p)} theme="light" variant="social" hideMeta />)}
              </div>
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
              <p className="text-[12px] text-[#9DAAB7] italic px-1">
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

  // Rendu CONVERSATION authentique (vraies bulles du chat) + TITRE en gras.
  // Un message « ## Titre » devient un titre d'étape ; le reste = bulles UnifiedBubble.
  function renderConversation(msgs: typeof post.messages) {
    const titleMsg = msgs.find((m) => (m.content || '').startsWith('## '));
    const conv = msgs.filter((m) => m !== titleMsg);
    return (
      <div className="min-h-full flex flex-col">
        {/* TITRE qui respire (gros, aéré, en haut) */}
        {titleMsg && (
          <h2 className="text-white text-[23px] font-bold text-center px-4 pt-3 pb-2 leading-tight drop-shadow">
            {(titleMsg.content || '').slice(3)}
          </h2>
        )}
        {/* EXEMPLE centré au milieu de la place restante */}
        <div className="flex-1 min-h-0 flex flex-col justify-center gap-1.5">
          {conv.map((m) => <UnifiedBubble key={m.id} message={toUnifiedMsg(m)} />)}
        </div>
      </div>
    );
  }

  // === MODE FULLSCREEN (stories) ===
  if (fullScreen) {
    return (
      <motion.div
        ref={rootRef}
        {...lp.bind}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.25 }}
        className="relative w-full h-full bg-[#0a0a0d] select-none overflow-hidden"
        data-testid={`post-card-${post.id}`}
      >
        {post.id && <CardDevButton cardId={post.id} className="absolute right-1.5 top-1.5 z-40" />}
        {/* SLIDES — plein cadre (absolute inset-0), même gabarit que les cards
            image/vidéo/texte. pt dégage header flottant + barre ; pb dégage le footer. */}
        {slides.length === 1 ? (
          <div className="absolute inset-0 overflow-y-auto scrollbar-none px-3 space-y-3" style={{ paddingTop: CONTENT_TOP, paddingBottom: FOOTER_H }}>
            {renderConversation(slides[0])}
          </div>
        ) : (
          <div
            ref={scrollerRef}
            onTouchStart={() => setPaused(true)}
            onTouchEnd={() => setTimeout(() => setPaused(false), 700)}
            className="absolute inset-0 flex overflow-x-auto snap-x snap-mandatory scrollbar-none"
            style={{ scrollSnapType: 'x mandatory' }}
          >
            {slides.map((slideMessages, idx) => (
              <div
                key={idx}
                className="w-full h-full flex-shrink-0 snap-start overflow-y-auto scrollbar-none px-3 space-y-3"
                style={{ scrollSnapAlign: 'start', paddingTop: CONTENT_TOP, paddingBottom: FOOTER_H }}
              >
                {renderConversation(slideMessages)}
              </div>
            ))}
          </div>
        )}

        {/* BARRE DE PROGRESSION (stories) — JUSTE SOUS le header, jamais sur le menu. */}
        {slides.length > 1 && (
          <div className="absolute inset-x-0 z-20 flex gap-1 px-3" style={{ top: TOP_RESERVE }}>
            {slides.map((_, idx) => (
              <div key={idx} className="flex-1 h-[3px] rounded-full bg-white/25 overflow-hidden">
                <div
                  key={`fill-${currentSlide}-${idx}`}
                  className="h-full bg-white rounded-full"
                  style={
                    idx < currentSlide
                      ? { width: '100%' }
                      : idx > currentSlide
                      ? { width: '0%' }
                      : {
                          width: '0%',
                          animation: `ttmProgress ${SLIDE_DURATION_MS}ms linear forwards`,
                          animationPlayState: paused || !isActive ? 'paused' : 'running',
                        }
                  }
                />
              </div>
            ))}
          </div>
        )}

        {/* Footer : bulle auteur (cerclée + badge +) + actions. Overlay bas, gradient. */}
        <div className="absolute bottom-0 inset-x-0 z-20 px-3 pt-3 pb-4 bg-gradient-to-t from-black/55 via-black/25 to-transparent">
          {/* Chrome commun : bulle auteur + barre d'actions (source unique PostChrome) */}
          <PostChrome author={post.author} cardKind={cardKind} cardId={post.id} likes={post.likes} views={post.views} commentCount={0} initialLikedByMe={initialLikedByMe} isOwner={isOwner} />
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
      className="relative bg-white/[0.04] backdrop-blur-md border border-white/8 rounded-2xl p-3.5 space-y-3 select-none"
      data-testid={`post-card-${post.id}`}
    >
      {post.id && <CardDevButton cardId={post.id} className="absolute right-1.5 top-1.5 z-40" />}
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
          {renderConversation(slides[0])}
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
                {renderConversation(slideMessages)}
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

export default memo(PostCard);
