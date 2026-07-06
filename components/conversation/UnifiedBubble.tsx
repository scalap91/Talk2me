'use client';

import React, { useRef, useCallback } from 'react';
import { motion, AnimatePresence, type PanInfo } from 'framer-motion';
import { Reply as ReplyIcon, Sparkles, Check, CheckCheck } from '@/lib/icons';
import YouTubeEmbed from '@/components/embeds/YouTubeEmbed';
import MusicDiscCard from '@/components/cards/MusicDiscCard';
import TikTokEmbed from '@/components/embeds/TikTokEmbed';
import PlaceCard from '@/components/cards/PlaceCard';
import RecipeCard from '@/components/cards/RecipeCard';
import ProductCard from '@/components/cards/ProductCard';
import WikipediaCard from '@/components/cards/WikipediaCard';
import WeatherCard from '@/components/cards/WeatherCard';
import SearchResultCard from '@/components/cards/SearchResultCard';
import CardActionsMenu from '@/components/cards/CardActionsMenu';
import LeaConstellation, { type Eclat } from './LeaConstellation';
import EmbedRenderer from '@/components/chat/EmbedRenderer';
import GeolocRequestBubble from '@/components/chat/GeolocRequestBubble';
import MediaImageCard from '@/components/chat/media/MediaImageCard';
import MediaVideoCard from '@/components/chat/media/MediaVideoCard';
import MediaAudioCard from '@/components/chat/media/MediaAudioCard';
// Talk2Me T2M Officiel cards attachées (Pascal 2026-06-05) — renderer
// universel pour les UnifiedCards renvoyées par l'IA officielle.
import UnifiedCardRenderer from '@/components/embed-hub/UnifiedCardRenderer';
import { extractUrls } from '@/lib/url-parser';
import { useChatStore } from '@/lib/store/chat';
import type { UnifiedMessage } from './types';

interface UnifiedBubbleProps {
  message: UnifiedMessage;
  onReply?: (m: UnifiedMessage) => void;
  /** Active drag-to-reply WhatsApp-style. Désactivé par défaut en conv IA solo. */
  enableSwipeReply?: boolean;
  /**
   * Talk2Me #351 — Active la sélection contiguë par long-press (500ms) + tap
   * d'extension. Réservé conv IA solo (interdit en P2P pour confidentialité).
   * Default false.
   */
  enableSelection?: boolean;
  /** Accusés de lecture (Pascal 2026-06-26) : ms jusqu'où le peer a lu. Si défini
   *  (conv P2P), on affiche ✓ (envoyé) / ✓✓ (lu) sur MES messages. */
  peerReadTs?: number;
}

const LONG_PRESS_MS = 500;

function formatTime(ts?: number): string {
  if (!ts) return '';
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/**
 * Talk2Me #337 — Bulle unifiée, partagée entre conv IA solo et conv P2P.
 *
 * Skeleton STRICTEMENT identique entre les deux contextes : seules les data
 * (author, name, avatar) changent.
 */
const UnifiedBubble: React.FC<UnifiedBubbleProps> = ({
  message,
  onReply,
  enableSwipeReply = false,
  enableSelection = false,
  peerReadTs,
}) => {
  // === Talk2Me #351 — Sélection contiguë (conv IA solo uniquement) ===
  // Subscriptions scalaires pour éviter re-render boucle. Pas d'effet en P2P
  // car le store useChatStore n'est rempli que par la page conv IA (/app/page).
  const selectionMode = useChatStore((s) => s.selectionMode);
  const selectionStartId = useChatStore((s) => s.selectionStartId);
  const selectionEndId = useChatStore((s) => s.selectionEndId);
  const storeMessages = useChatStore((s) => s.messages);
  const enterSelection = useChatStore((s) => s.enterSelection);
  const extendSelectionTo = useChatStore((s) => s.extendSelectionTo);

  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFired = useRef<boolean>(false);

  const isTempOrSeed =
    message.id.startsWith('temp-') || message.id.startsWith('seed-');

  // Calcule si CE message est dans la range contiguë sélectionnée.
  // On lookup dans storeMessages (= messages "vrais" de la conv IA). Si le
  // message n'y est pas (cas P2P / message hors store) → toujours false.
  const isInSelectionRange = (() => {
    if (!enableSelection) return false;
    if (!selectionStartId || !selectionEndId) return false;
    const startIdx = storeMessages.findIndex((m) => m.id === selectionStartId);
    const endIdx = storeMessages.findIndex((m) => m.id === selectionEndId);
    const myIdx = storeMessages.findIndex((m) => m.id === message.id);
    if (startIdx === -1 || endIdx === -1 || myIdx === -1) return false;
    const minIdx = Math.min(startIdx, endIdx);
    const maxIdx = Math.max(startIdx, endIdx);
    return myIdx >= minIdx && myIdx <= maxIdx;
  })();

  const showCheckbox = enableSelection && selectionMode && !isTempOrSeed;

  const clearLongPressTimer = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const startLongPress = useCallback(() => {
    if (!enableSelection || isTempOrSeed) return;
    clearLongPressTimer();
    longPressFired.current = false;
    longPressTimer.current = setTimeout(() => {
      longPressFired.current = true;
      try {
        if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
          (navigator as Navigator & { vibrate: (p: number) => void }).vibrate(20);
        }
      } catch {
        /* ignore */
      }
      // Si déjà en sélection → étend, sinon → entre en sélection sur cette bulle
      const state = useChatStore.getState();
      if (state.selectionMode) {
        extendSelectionTo(message.id);
      } else {
        enterSelection(message.id);
      }
    }, LONG_PRESS_MS);
  }, [
    enableSelection,
    isTempOrSeed,
    clearLongPressTimer,
    enterSelection,
    extendSelectionTo,
    message.id,
  ]);

  const handleBubbleClick = useCallback(() => {
    if (!enableSelection || isTempOrSeed) return;
    if (selectionMode) {
      extendSelectionTo(message.id);
    }
  }, [enableSelection, isTempOrSeed, selectionMode, extendSelectionTo, message.id]);

  const selectionHandlers = enableSelection
    ? {
        onTouchStart: startLongPress,
        onTouchEnd: clearLongPressTimer,
        onTouchMove: clearLongPressTimer,
        onTouchCancel: clearLongPressTimer,
        onMouseDown: startLongPress,
        onMouseUp: clearLongPressTimer,
        onMouseLeave: clearLongPressTimer,
        onContextMenu: (e: React.MouseEvent) => {
          // Desktop : clic droit = long-press
          if (!isTempOrSeed) {
            e.preventDefault();
            const state = useChatStore.getState();
            if (state.selectionMode) {
              extendSelectionTo(message.id);
            } else {
              enterSelection(message.id);
            }
          }
        },
        onClick: handleBubbleClick,
      }
    : {};
  // Talk2Me #338 — 4 valeurs d'auteur. Legacy 'ai_reply' → 'peer-ai'.
  const rawAuthor = message.author;
  const author: 'me' | 'me-ai' | 'peer' | 'peer-ai' =
    rawAuthor === 'ai_reply' ? 'peer-ai' : rawAuthor;
  const isMine = author === 'me';
  const isMyAi = author === 'me-ai';
  const isPeerAi = author === 'peer-ai';
  const isAi = isMyAi || isPeerAi;
  const isOnRight = author === 'me' || author === 'me-ai';
  const timeLabel = formatTime(message.timestamp);

  // Détection cards
  // Talk2Me #363 Bug B (Pascal 2026-06-05) : ne pas render YouTubeCard si
  // video_id absent / vide (filet final contre hallucination homepage YT).
  const hasYoutube =
    message.youtube !== undefined &&
    message.youtube !== null &&
    typeof (message.youtube as { video_id?: unknown }).video_id === 'string' &&
    ((message.youtube as { video_id: string }).video_id.trim().length > 0);
  const hasTiktok = message.tiktok !== undefined && message.tiktok !== null;
  const hasPlaces = Array.isArray(message.places) && message.places.length > 0;
  const hasRecipe = !!message.recipe;
  const hasProducts = Array.isArray(message.products) && message.products.length > 0;
  const hasWikipedia = !!message.wikipedia;
  const hasWeather = !!message.weather;
  const hasWebSearch =
    !!message.web_search &&
    Array.isArray(message.web_search.results) &&
    message.web_search.results.length > 0;
  const hasGeolocBubble = message.requires_geoloc === true;
  const hasMedia = !!message.media && typeof message.media.url === 'string';
  // Talk2Me T2M Officiel cards attachées (Pascal 2026-06-05) — UnifiedCards
  // renvoyées par l'IA officielle (RE-SERT le contenu cité dans la réponse).
  const hasAttachedCards =
    Array.isArray(message.attached_cards) && message.attached_cards.length > 0;
  const hasAnyCard =
    hasYoutube || hasTiktok || hasPlaces || hasRecipe || hasProducts || hasWikipedia ||
    hasWeather || hasWebSearch || hasGeolocBubble || hasMedia || hasAttachedCards;

  const handleDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.x > 50 && onReply) {
      onReply(message);
    }
  };

  // Talk2Me #351 — En selectionMode on désactive le swipe-reply pour éviter
  // le conflit gestuel (tap range vs drag horizontal).
  const swipeReplyActive = enableSwipeReply && !(enableSelection && selectionMode);
  const dragProps = swipeReplyActive
    ? {
        drag: 'x' as const,
        dragConstraints: { left: 0, right: 80 },
        dragElastic: 0.2,
        dragSnapToOrigin: true,
        onDragEnd: handleDragEnd,
      }
    : {};

  // Cards bloc (rendu commun)
  const cardsBlock = hasAnyCard ? (
    <div className="flex flex-col gap-3 w-full" data-testid="bubble-cards">
      {hasMedia && message.media && message.media.type === 'image' && (
        <MediaImageCard
          url={message.media.url}
          filename={message.media.filename ?? undefined}
        />
      )}
      {hasMedia && message.media && message.media.type === 'video' && (
        <MediaVideoCard
          url={message.media.url}
          filename={message.media.filename ?? undefined}
          poster={message.media.poster ?? undefined}
          channelId={message.id}
        />
      )}
      {hasMedia && message.media && message.media.type === 'audio' && (
        <MediaAudioCard
          url={message.media.url}
          filename={message.media.filename ?? undefined}
          channelId={message.id}
        />
      )}
      {hasYoutube && message.youtube && (message.youtube as { is_music?: boolean }).is_music && (
        <div className="relative">
          <MusicDiscCard
            videoId={message.youtube.video_id}
            title={message.youtube.title}
            artist={message.youtube.channel}
            thumbnail={message.youtube.thumbnail}
          />
        </div>
      )}
      {hasYoutube && message.youtube && !(message.youtube as { is_music?: boolean }).is_music && (
        <div className="relative">
          <YouTubeEmbed
            videoId={message.youtube.video_id}
            originalUrl={`https://www.youtube.com/watch?v=${message.youtube.video_id}`}
            rich={{
              title: message.youtube.title,
              channel: message.youtube.channel,
              description: message.youtube.description,
            }}
          />
          <CardActionsMenu
            cardKind="youtube"
            cardData={message.youtube}
            sourceMessageId={message.id}
            title={message.youtube.title}
          />
        </div>
      )}
      {hasTiktok && message.tiktok && (
        <div className="relative">
          {/* Talk2Me search_tiktok (Pascal 2026-06-04) — vidéo filtrée par les
              5 garde-fous handler-side (catégorie/popularité/blacklist/IA/cap 1).
              Embed officiel TikTok (script tiktok.com/embed.js). */}
          <TikTokEmbed
            videoId={message.tiktok.video_id}
            user={message.tiktok.user}
            originalUrl={message.tiktok.original_url}
          />
        </div>
      )}
      {hasRecipe && message.recipe && (
        <div className="relative">
          <RecipeCard recipe={message.recipe} />
          <CardActionsMenu
            cardKind="recipe"
            cardData={message.recipe}
            sourceMessageId={message.id}
            title={message.recipe.name}
          />
        </div>
      )}
      {hasWikipedia && message.wikipedia && (
        <div className="relative">
          <WikipediaCard page={message.wikipedia} />
          <CardActionsMenu
            cardKind="wikipedia"
            cardData={message.wikipedia}
            sourceMessageId={message.id}
            title={message.wikipedia.title}
          />
        </div>
      )}
      {hasWeather && message.weather && (
        <div className="relative">
          <WeatherCard weather={message.weather} />
          <CardActionsMenu
            cardKind="weather"
            cardData={message.weather}
            sourceMessageId={message.id}
            title={message.weather.place_label || 'Météo'}
          />
        </div>
      )}
      {hasWebSearch && message.web_search && (
        <div className="relative">
          <SearchResultCard data={message.web_search} />
          <CardActionsMenu
            cardKind="web_search"
            cardData={message.web_search}
            sourceMessageId={message.id}
            title="Recherche web"
          />
        </div>
      )}
      {hasPlaces && message.places && (
        <div className="relative">
          {/* Constellation d'Éclats (Gemini SPEC-CONV-CONSTEL) : Léa propose ≥2 lieux
              → ils naissent en grappe flottante ; 1 seul lieu → PlaceCard classique. */}
          {message.places.length >= 2 ? (
            <LeaConstellation
              eclats={message.places.slice(0, 6).map((p, i) => ({
                id: String(i),
                tag: (p.category || 'LIEU').toUpperCase().slice(0, 10),
                title: p.name,
                sub: [p.cuisine || p.category, Number.isFinite(p.distance_m) ? `${Math.round(p.distance_m)} m` : null].filter(Boolean).join(' · '),
                tone: (['r', 'c', 'u'] as const)[i % 3],
                x: [8, 180, 70, 150, 20, 120][i % 6],
                y: [20, 70, 160, 20, 150, 180][i % 6],
                depth: [1.1, 0.82, 0.95, 1.0, 0.9, 0.88][i % 6],
                body: p.address || '',
              } as Eclat))}
            />
          ) : (
            <PlaceCard
              places={message.places}
              intentQuery={message.intent_query ?? undefined}
              userLat={message.user_lat ?? undefined}
              userLng={message.user_lng ?? undefined}
            />
          )}
          <CardActionsMenu
            cardKind="place"
            cardData={{
              places: message.places,
              intent_query: message.intent_query,
              user_lat: message.user_lat,
              user_lng: message.user_lng,
            }}
            sourceMessageId={message.id}
            title={message.intent_query || 'Lieux'}
          />
        </div>
      )}
      {hasProducts && message.products && (
        <div className="relative">
          <ProductCard products={message.products} />
          <CardActionsMenu
            cardKind="product"
            cardData={message.products}
            sourceMessageId={message.id}
            title="Produits"
          />
        </div>
      )}
      {hasGeolocBubble && <GeolocRequestBubble />}
      {/* Talk2Me T2M Officiel cards attachées (Pascal 2026-06-05) — RE-SERT
          les UnifiedCards d'origine (post YouTube/article/TikTok) sous le
          texte de la bulle. Bug fix verbatim : "il ne sait pas me ressevir
          en card dorigine le contenue quil a citer". Cap 3 enforced
          serveur. inline-chat variant pour rendu compact. */}
      {hasAttachedCards && message.attached_cards && (
        <div className="space-y-3" data-testid="bubble-attached-cards">
          {message.attached_cards.slice(0, 3).map((card, i) => (
            <UnifiedCardRenderer
              key={`attached-${i}-${card.source}`}
              card={card}
              variant="inline-chat"
            />
          ))}
        </div>
      )}
    </div>
  ) : null;

  // Liens extras (URLs détectées dans le texte + extraLinks explicites)
  const inlineUrls = extractUrls(message.content || '');
  const allUrls = Array.from(
    new Set([
      ...(inlineUrls || []),
      ...((message.extraLinks || []).filter((u) => /^https?:\/\//i.test(u))),
    ])
  );
  const extraEmbeds = allUrls.length > 0 ? (
    <div className="flex flex-col gap-3 w-full mt-2">
      {allUrls.map((u, i) => (
        <EmbedRenderer key={`emb-${i}`} url={u} />
      ))}
    </div>
  ) : null;

  // Talk2Me #341 — Style bulle WhatsApp final (Pascal 2026-06-04).
  // Pascal verbatim : "on afiche comme eux pour la conversation ia moi et aussi
  // moi amis [...] une bien a gauche du cadre et lautre bien a droite pas de
  // conversation centré". Léa hérite couleur de MA conv → me-ai = me.
  // - 'me'      : droite, violet plein, tail bas-droit
  // - 'me-ai'   : idem 'me' (Léa = couleur de MA conv)
  // - 'peer'    : gauche, neutre plein, tail bas-gauche
  // - 'peer-ai' : idem 'peer' (visuel identique, micro ✨ inline en signature)
  const bubbleStyleByAuthor: Record<typeof author, string> = {
    me: 'bg-red-600 text-white rounded-2xl rounded-br-sm',
    'me-ai': 'bg-red-600 text-white rounded-2xl rounded-br-sm',
    peer: 'bg-neutral-800 text-white rounded-2xl rounded-bl-sm',
    'peer-ai': 'bg-neutral-800 text-white rounded-2xl rounded-bl-sm',
  };

  const displayName =
    message.author_name || (isMine ? 'Toi' : isMyAi ? 'IA' : isPeerAi ? 'IA' : 'Lui');

  // Talk2Me #351 — Checkbox de sélection. Rendu seulement en selectionMode
  // sur conv IA solo. Position : gauche pour bulle peer, droite pour bulle me.
  const checkbox = showCheckbox ? (
    <motion.div
      key={`cb-${message.id}`}
      initial={{ opacity: 0, scale: 0.5 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.5 }}
      transition={{ duration: 0.18 }}
      className={`w-[18px] h-[18px] rounded-full shrink-0 self-center flex items-center justify-center ${
        isInSelectionRange
          ? 'bg-red-500 border border-red-500'
          : 'border border-red-400/60 bg-white/5'
      }`}
      aria-hidden="true"
      data-testid={`bubble-selection-checkbox${isInSelectionRange ? '-on' : '-off'}`}
    >
      {isInSelectionRange && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
    </motion.div>
  ) : null;

  // Ring d'accent quand la bulle fait partie de la range sélectionnée.
  const selectionRingClass = isInSelectionRange ? 'ring-1 ring-red-400/60' : '';

  return (
    <div className="relative flex flex-col">
      {swipeReplyActive && (
        <div
          className="absolute left-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-red-500/20 flex items-center justify-center pointer-events-none opacity-0"
          aria-hidden="true"
        >
          <ReplyIcon size={14} className="text-red-300" />
        </div>
      )}
      <motion.div
        {...dragProps}
        data-testid={`bubble-${author}`}
        data-author={author}
        data-ai-name={isAi ? displayName : undefined}
        data-in-selection={isInSelectionRange ? '1' : undefined}
        className={`flex w-full touch-pan-y items-center gap-2 ${
          isOnRight ? 'justify-end' : 'justify-start'
        }`}
      >
        {/* Checkbox à GAUCHE pour bulles peer */}
        <AnimatePresence>
          {showCheckbox && !isOnRight && (
            <div className="ml-3 shrink-0">{checkbox}</div>
          )}
        </AnimatePresence>

        <div
          className={`flex flex-col gap-1 min-w-0 ${
            hasAnyCard ? 'max-w-[85%] lg:max-w-[560px]' : 'max-w-[75%]'
          } ${
            isOnRight
              ? `${showCheckbox ? '' : 'mr-3'} items-end`
              : `${showCheckbox ? '' : 'ml-3'} items-start`
          }`}
        >
          {/* Talk2Me #342 + #391 — Badge IA visible au-dessus de la bulle dès
              qu'une IA répond (me-ai ou peer-ai), en P2P ET en conv solo.
              Pascal verbatim 2026-06-04 : "putain laisse le badge ia au moins
              dans la conversation on sait meme pas cest une reponse ia".
              Pascal verbatim 2026-06-05 : "ou sont les tag nom ia de maniere
              general" → en conv solo aussi maintenant (agent mappé en 'peer-ai'). */}
          {isAi && (
            <div
              className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wider ${
                isMyAi
                  ? 'bg-red-500/25 text-red-200'
                  : 'bg-white/10 text-white/80'
              }`}
              data-testid="bubble-ai-badge"
            >
              <Sparkles size={10} aria-hidden="true" />
              <span>{displayName}</span>
            </div>
          )}
          {(message.content || message.quotedPreview) && (
            <div
              {...selectionHandlers}
              data-testid={`bubble-${author}-inner`}
              className={`max-w-full px-3 py-1.5 text-[14px] leading-snug ${bubbleStyleByAuthor[author]} ${selectionRingClass} ${enableSelection ? 'select-none' : ''}`}
            >
              {/* Talk2Me #386 (Pascal 2026-06-05) — Header AUTEUR de la bulle
                  obligatoire dès qu'il y a un quoted_preview, sinon on confond
                  l'auteur du quote (Pascal) avec l'auteur de la bulle (T2M
                  Officiel). S'affiche pour peer / peer-ai uniquement (les
                  bulles "me" / "me-ai" sont implicitement de l'user). */}
              {message.quotedPreview && !isOnRight && message.author_name && (
                <div
                  className="text-[11px] font-semibold text-white/90 mb-1"
                  data-testid="bubble-author-name"
                >
                  {message.author_name}
                </div>
              )}
              {message.quotedPreview && (
                <div className="mb-1.5 -mx-1 px-2 py-1 rounded bg-white/[0.10] border-l-2 border-white/40">
                  <div className="text-[10px] uppercase tracking-wider text-white/75 font-medium">
                    {message.quotedPreview.author_name}
                  </div>
                  <div className="text-[12px] text-white/65 truncate">
                    {message.quotedPreview.text}
                  </div>
                </div>
              )}
              <div className="flex items-end gap-1 flex-wrap">
                <span className="whitespace-pre-wrap break-words">
                  {message.content}
                </span>
                {timeLabel && (
                  <span
                    className="text-[10px] text-white/60 ml-1 self-end shrink-0 pointer-events-none leading-none pb-0.5"
                    data-testid="bubble-time"
                  >
                    {timeLabel}
                  </span>
                )}
                {/* Accusés WhatsApp : MES messages → ✓ envoyé / ✓✓ bleu = lu. */}
                {typeof peerReadTs === 'number' && isMine && (
                  message.timestamp && message.timestamp <= peerReadTs
                    ? <CheckCheck className="w-3.5 h-3.5 text-sky-400 self-end shrink-0 pb-0.5" strokeWidth={2.5} data-testid="receipt-read" />
                    : <Check className="w-3.5 h-3.5 text-white/55 self-end shrink-0 pb-0.5" strokeWidth={2.5} data-testid="receipt-sent" />
                )}
              </div>
            </div>
          )}
          {/* Cards bloc : on attache les handlers de sélection ici aussi pour
              qu'un long-press sur une card riche (YouTube/Place/etc.) entre
              également en sélection. Le ring entoure tout le bloc cards. */}
          {cardsBlock && (
            <div
              {...selectionHandlers}
              className={`w-full rounded-2xl ${selectionRingClass}`}
            >
              {cardsBlock}
            </div>
          )}
          {extraEmbeds}
          {/* Si pas de contenu texte mais cards/embeds → heure sous bloc */}
          {!message.content && !message.quotedPreview && timeLabel && (hasAnyCard || allUrls.length > 0) && (
            <div
              className={`text-[10px] text-white/45 ${isOnRight ? 'pr-1' : 'pl-1'}`}
              data-testid="bubble-time"
            >
              {timeLabel}
            </div>
          )}
        </div>

        {/* Checkbox à DROITE pour bulles me / me-ai */}
        <AnimatePresence>
          {showCheckbox && isOnRight && (
            <div className="mr-3 shrink-0">{checkbox}</div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
};

export default UnifiedBubble;
