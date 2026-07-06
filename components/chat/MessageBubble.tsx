'use client';

import React, { useRef } from 'react';
import { motion } from 'framer-motion';
import { Check } from '@/lib/icons';
import { extractUrls } from '@/lib/url-parser';
import EmbedRenderer from './EmbedRenderer';
import YouTubeEmbed from '@/components/embeds/YouTubeEmbed';
import MusicDiscCard from '@/components/cards/MusicDiscCard';
import PlaceCard from '@/components/cards/PlaceCard';
import RecipeCard from '@/components/cards/RecipeCard';
import ProductCard from '@/components/cards/ProductCard';
import WikipediaCard from '@/components/cards/WikipediaCard';
import WeatherCard from '@/components/cards/WeatherCard';
import SearchResultCard from '@/components/cards/SearchResultCard';
import GeolocRequestBubble from './GeolocRequestBubble';
import CardActionsMenu from '@/components/cards/CardActionsMenu';
import { useChatStore } from '@/lib/store/chat';
import type {
  YouTubeCardData,
  PlaceCardData,
  RecipeCardData,
  ProductCardData,
  WebSearchData,
} from '@/lib/chat-types';
import type { WikipediaCardData } from '@/lib/wikipedia-search';
import type { WeatherCardData } from '@/lib/weather';

interface MessageBubbleProps {
  messageId: string;
  role: 'user' | 'agent';
  content: string;
  timestamp?: number;
  /** Liens supplémentaires fournis par l'agent (hors texte). */
  extraLinks?: string[];
  /**
   * - objet : afficher la card YouTube riche
   * - null : afficher message "Je n'ai pas trouvé de vidéo fiable."
   * - undefined : pas de recherche YT pour ce message
   */
  youtube?: YouTubeCardData | null;
  /** Lieux OSM (carousel PlaceCard). */
  places?: PlaceCardData[] | null;
  /** Mot-clé métier pour deep-link Maps (ex "pharmacie"). */
  intent_query?: string;
  /** Position user au moment de la recherche (pour centrer Maps). */
  user_lat?: number;
  user_lng?: number;
  /** True → afficher GeolocRequestBubble. */
  requires_geoloc?: boolean;
  /** Recette scrapée Marmiton/CuisineAZ.
   * - objet : render RecipeCard
   * - null : pas trouvé (front silencieux, ne rend rien)
   * - undefined : pas de recherche recipe */
  recipe?: RecipeCardData | null;
  /** Produits scrapés AliExpress (carousel ProductCard).
   * - array non-vide : render carousel full-bleed
   * - [] ou null : front silencieux (doctrine no-excuses)
   * - undefined : pas de recherche product */
  products?: ProductCardData[] | null;
  /** Article Wikipedia (résumé titre + extrait + image). */
  wikipedia?: WikipediaCardData | null;
  /** Météo actuelle (Open-Meteo). */
  weather?: WeatherCardData | null;
  /** Résultats de recherche web (search_web tool : Brave Search ou DDG fallback). */
  web_search?: WebSearchData | null;
}

function YouTubeBlock({
  youtube,
  messageId,
}: {
  youtube: YouTubeCardData | null;
  messageId: string;
}) {
  if (youtube === null) {
    return (
      <div className="text-xs text-white/60 italic mt-3">
        Je n&apos;ai pas trouvé de vidéo fiable.
      </div>
    );
  }
  // Talk2Me #422 — musique (search_music) → rendu disque vinyle (player Music Card).
  if (youtube.is_music) {
    return (
      <div className="mt-3">
        <MusicDiscCard
          videoId={youtube.video_id}
          title={youtube.title}
          artist={youtube.channel}
          thumbnail={youtube.thumbnail}
        />
      </div>
    );
  }
  return (
    <div className="mt-3 relative">
      <YouTubeEmbed
        videoId={youtube.video_id}
        originalUrl={`https://www.youtube.com/watch?v=${youtube.video_id}`}
        rich={{
          title: youtube.title,
          channel: youtube.channel,
          description: youtube.description,
        }}
      />
      <CardActionsMenu
        cardKind="youtube"
        cardData={youtube}
        sourceMessageId={messageId}
        title={youtube.title}
      />
    </div>
  );
}

/**
 * Wrapper qui rajoute le menu actions ⋯ sur une card. La card child doit
 * occuper la zone (relative parent).
 */
function CardWithActions({
  children,
  cardKind,
  cardData,
  messageId,
  title,
}: {
  children: React.ReactNode;
  cardKind:
    | 'place'
    | 'recipe'
    | 'wikipedia'
    | 'weather'
    | 'product'
    | 'web_search';
  cardData: unknown;
  messageId: string;
  title?: string | null;
}) {
  return (
    <div className="relative">
      {children}
      <CardActionsMenu
        cardKind={cardKind}
        cardData={cardData}
        sourceMessageId={messageId}
        title={title || null}
      />
    </div>
  );
}

const URL_RE = /\bhttps?:\/\/[^\s<>"']+/gi;

/** Rend un texte avec les URLs en liens cliquables. */
function renderTextWithLinks(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let lastIdx = 0;
  let key = 0;
  const matches = text.matchAll(URL_RE);
  for (const m of matches) {
    const idx = m.index ?? 0;
    if (idx > lastIdx) {
      nodes.push(text.slice(lastIdx, idx));
    }
    const url = m[0].replace(/[).,;:!?]+$/, '');
    nodes.push(
      <a
        key={`link-${key++}`}
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-red-300/90 underline underline-offset-2 break-all"
      >
        {url}
      </a>
    );
    lastIdx = idx + url.length;
  }
  if (lastIdx < text.length) {
    nodes.push(text.slice(lastIdx));
  }
  return nodes;
}

const MessageBubble: React.FC<MessageBubbleProps> = ({
  messageId,
  role,
  content,
  timestamp,
  extraLinks,
  youtube,
  places,
  intent_query,
  user_lat,
  user_lng,
  requires_geoloc,
  recipe,
  products,
  wikipedia,
  weather,
  web_search,
}) => {
  const selectionMode = useChatStore((s) => s.selectionMode);
  const enterSelection = useChatStore((s) => s.enterSelection);
  const extendSelectionTo = useChatStore((s) => s.extendSelectionTo);
  const selectionStartId = useChatStore((s) => s.selectionStartId);
  const selectionEndId = useChatStore((s) => s.selectionEndId);
  const messages = useChatStore((s) => s.messages);

  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Talk2Me #400 (Pascal 2026-06-05) : iframes (Spotify/YT/TikTok) capturent
  // les touch events et déclenchent touchmove dès le 1er pixel → long-press
  // 500ms annulé avant déclenchement. On tolère 10px de jitter avant clear.
  const touchStartXY = useRef<{ x: number; y: number } | null>(null);

  const isTempOrSeed = messageId.startsWith('temp-') || messageId.startsWith('seed-');

  const isInRange = (() => {
    if (!selectionStartId || !selectionEndId) return false;
    const startIdx = messages.findIndex((m) => m.id === selectionStartId);
    const endIdx = messages.findIndex((m) => m.id === selectionEndId);
    const myIdx = messages.findIndex((m) => m.id === messageId);
    if (startIdx === -1 || endIdx === -1 || myIdx === -1) return false;
    const minIdx = Math.min(startIdx, endIdx);
    const maxIdx = Math.max(startIdx, endIdx);
    return myIdx >= minIdx && myIdx <= maxIdx;
  })();

  const clearTimer = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const startLongPress = () => {
    if (isTempOrSeed) return;
    clearTimer();
    longPressTimer.current = setTimeout(() => {
      enterSelection(messageId);
    }, 500);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    touchStartXY.current = t ? { x: t.clientX, y: t.clientY } : null;
    startLongPress();
  };
  const handleTouchEnd = () => {
    touchStartXY.current = null;
    clearTimer();
  };
  const handleTouchMove = (e: React.TouchEvent) => {
    // Talk2Me #400 : iframes Spotify/YT/TikTok déclenchent touchmove sur
    // bubble parent dès qu'on touche l'iframe. On ne clear que si vrai scroll
    // (mouvement > 10px) — un jitter de quelques pixels ne tue pas le 500ms.
    const start = touchStartXY.current;
    if (!start) return;
    const t = e.touches[0];
    if (!t) return;
    const dx = Math.abs(t.clientX - start.x);
    const dy = Math.abs(t.clientY - start.y);
    if (dx > 10 || dy > 10) {
      touchStartXY.current = null;
      clearTimer();
    }
  };
  const handleMouseDown = () => startLongPress();
  const handleMouseUp = () => clearTimer();
  const handleMouseLeave = () => clearTimer();

  const handleBubbleClick = () => {
    if (selectionMode && !isTempOrSeed) {
      extendSelectionTo(messageId);
    }
  };

  const formatTime = (ts?: number) => {
    if (!ts) return '';
    const date = new Date(ts);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // Collecte des URLs à embedder : URLs détectées dans le texte + extraLinks
  const inlineUrls = extractUrls(content);
  const allUrls = Array.from(
    new Set([...(inlineUrls || []), ...((extraLinks || []).filter((u) => /^https?:\/\//i.test(u)))])
  );

  // Talk2Me #372 (Pascal 2026-06-05) : si le contenu est UNIQUEMENT une URL
  // qui sera embed (TikTok, YouTube, Facebook, etc.), on cache le texte URL
  // — l'embed parle de lui-même, pas besoin d'afficher l'URL en doublon.
  // Talk2Me #400 : assoupli — tolère trailing whitespace/newline ET autorise
  // les variantes normalisées (sans tracking ?si=, ?t=, etc).
  const trimmedContent = (content || '').replace(/\s+/g, ' ').trim();
  const stripTracking = (u: string) =>
    u.replace(/[?&](si|t|utm_[a-z]+|fbclid|igshid|spm)=[^&#]*/gi, '').replace(/[?&]$/, '');
  const isJustUrl =
    allUrls.length >= 1 &&
    (allUrls.includes(trimmedContent) ||
      allUrls.some((u) => stripTracking(u) === stripTracking(trimmedContent)) ||
      trimmedContent.length === 0);

  const checkbox = (
    <motion.div
      initial={{ opacity: 0, scale: 0.5 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.5 }}
      transition={{ duration: 0.2 }}
      className={`w-6 h-6 rounded-full shrink-0 self-center flex items-center justify-center ${
        isInRange
          ? 'bg-red-500/90 border-2 border-transparent'
          : 'border-2 border-white/20 bg-white/5'
      }`}
    >
      {isInRange && <Check className="w-3.5 h-3.5 text-white" />}
    </motion.div>
  );

  const hasYoutubeField = youtube !== undefined; // objet OU null
  const hasPlaces = Array.isArray(places) && places.length > 0;
  const hasGeolocBubble = requires_geoloc === true;
  // Doctrine no-excuses : si recipe===null (scraping échoué), on n'affiche rien.
  // Le texte agent ("Voici une recette de couscous 👇") reste visible mais
  // pas de card cassée ni de message d'erreur.
  const hasRecipe = !!recipe;
  // Idem produits : scraping vide → silence côté UI (doctrine no-excuses).
  const hasProducts = Array.isArray(products) && products.length > 0;
  const hasWikipedia = !!wikipedia;
  const hasWeather = !!weather;
  const hasWebSearch =
    !!web_search && Array.isArray(web_search.results) && web_search.results.length > 0;
  // Cas agent avec contenu vide et pas d'URLs ni youtube ni places/geoloc/recipe/products/wiki/weather/web_search : ne rien rendre
  if (
    role === 'agent' &&
    content.trim() === '' &&
    allUrls.length === 0 &&
    !hasYoutubeField &&
    !hasPlaces &&
    !hasGeolocBubble &&
    !hasRecipe &&
    !hasProducts &&
    !hasWikipedia &&
    !hasWeather &&
    !hasWebSearch
  ) {
    return null;
  }

  // Cas agent avec contenu vide mais des URLs / youtube / recipe / products / wiki / weather / web_search : rendre uniquement les embeds.
  // PlaceCard et ProductCard (carousel) sont rendus HORS bulle pour prendre toute la largeur (full-bleed).
  if (
    role === 'agent' &&
    content.trim() === '' &&
    (allUrls.length > 0 ||
      hasYoutubeField ||
      hasPlaces ||
      hasGeolocBubble ||
      hasRecipe ||
      hasProducts ||
      hasWikipedia ||
      hasWeather ||
      hasWebSearch)
  ) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
        className="flex flex-col w-full items-start gap-3"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onTouchMove={handleTouchMove}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
      >
        <div className="flex items-start gap-1.5 max-w-[75%]">
          {selectionMode && checkbox}
          <div className="flex items-start gap-1.5">
            <div className="flex flex-col items-center gap-1 shrink-0">
              <div className="w-6 h-6 rounded-full bg-white/10 border border-white/10 flex items-center justify-center text-white/60 text-[10px] font-medium">
                A
              </div>
            </div>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, ease: 'easeOut' }}
              className={`space-y-3 ${isInRange ? 'ring-1 ring-red-400/50 rounded-lg' : ''}`}
              onClick={handleBubbleClick}
            >
              {allUrls.map((u, i) => (
                <motion.div
                  key={`emb-${i}`}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, ease: 'easeOut', delay: 0.1 + i * 0.1 }}
                >
                  <EmbedRenderer url={u} />
                </motion.div>
              ))}
              {hasYoutubeField && (
                <YouTubeBlock
                  youtube={youtube as YouTubeCardData | null}
                  messageId={messageId}
                />
              )}
              {hasRecipe && (
                <CardWithActions
                  cardKind="recipe"
                  cardData={recipe}
                  messageId={messageId}
                  title={(recipe as RecipeCardData)?.name}
                >
                  <RecipeCard recipe={recipe as RecipeCardData} />
                </CardWithActions>
              )}
              {hasWikipedia && (
                <CardWithActions
                  cardKind="wikipedia"
                  cardData={wikipedia}
                  messageId={messageId}
                  title={(wikipedia as WikipediaCardData)?.title}
                >
                  <WikipediaCard page={wikipedia as WikipediaCardData} />
                </CardWithActions>
              )}
              {hasWeather && (
                <CardWithActions
                  cardKind="weather"
                  cardData={weather}
                  messageId={messageId}
                  title={(weather as WeatherCardData)?.place_label || 'Météo'}
                >
                  <WeatherCard weather={weather as WeatherCardData} />
                </CardWithActions>
              )}
              {hasWebSearch && (
                <CardWithActions
                  cardKind="web_search"
                  cardData={web_search}
                  messageId={messageId}
                  title="Recherche web"
                >
                  <SearchResultCard data={web_search as WebSearchData} />
                </CardWithActions>
              )}
              {hasGeolocBubble && <GeolocRequestBubble />}
            </motion.div>
          </div>
        </div>
        {/* PlaceCard full-bleed : sort de la bulle 75% pour le ruban scrollable */}
        {hasPlaces && (
          <div className="w-full">
            <CardWithActions
              cardKind="place"
              cardData={{
                places,
                intent_query,
                user_lat,
                user_lng,
              }}
              messageId={messageId}
              title={intent_query || 'Lieux'}
            >
              <PlaceCard
                places={places as PlaceCardData[]}
                intentQuery={intent_query}
                userLat={user_lat}
                userLng={user_lng}
              />
            </CardWithActions>
          </div>
        )}
        {/* ProductCard full-bleed : même règle que PlaceCard, ruban scrollable. */}
        {hasProducts && (
          <div className="w-full">
            <CardWithActions
              cardKind="product"
              cardData={products}
              messageId={messageId}
              title="Produits"
            >
              <ProductCard products={products as ProductCardData[]} allowCreate />
            </CardWithActions>
          </div>
        )}
      </motion.div>
    );
  }

  if (role === 'user') {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
        className="flex w-full justify-end"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onTouchMove={handleTouchMove}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
      >
        {/* Talk2Me #376 (Pascal 2026-06-05) — quand isJustUrl, EmbedRenderer
            sort de la bulle pour prendre la pleine largeur du conteneur
            parent (PostCard slide ou conv). Sinon iframe écrasée à 47px. */}
        {isJustUrl ? (
          <div className="flex flex-col w-full gap-2 items-end">
            {selectionMode && (
              <div className="flex items-center gap-2 w-full justify-end">{checkbox}</div>
            )}
            <span className="text-xs font-medium text-white/50">You</span>
            <div className="w-full" onClick={handleBubbleClick}>
              {allUrls.map((u, i) => (
                <motion.div
                  key={`emb-${i}`}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, ease: 'easeOut', delay: 0.1 + i * 0.1 }}
                  className={`w-full ${i > 0 ? 'mt-3' : ''} ${isInRange ? 'ring-1 ring-red-400/50 rounded-2xl' : ''}`}
                >
                  <EmbedRenderer url={u} />
                </motion.div>
              ))}
              {timestamp && (
                <p className="text-[10px] text-white/40 text-right mt-1 whitespace-nowrap">{formatTime(timestamp)}</p>
              )}
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-2 max-w-[88%] min-w-0">
            {selectionMode && checkbox}
            <div className="flex flex-col items-end gap-1 min-w-0 max-w-full">
              <span className="text-xs font-medium text-white/50 text-right">You</span>
              <div
                className={`inline-block max-w-[75%] bg-[#23232e] text-white rounded-2xl rounded-br-md px-4 py-2.5 border border-white/15 border-l-2 border-l-red-400/40 shadow-[0_1px_4px_rgba(0,0,0,0.3)] ${
                  isInRange ? 'ring-1 ring-red-400/50' : ''
                }`}
                style={{
                  width: 'fit-content',
                  maxWidth: '100%',
                  wordBreak: 'break-word',
                  overflowWrap: 'anywhere',
                  hyphens: 'none',
                }}
                onClick={handleBubbleClick}
              >
                <p className="text-[15.5px] leading-[1.4] whitespace-pre-wrap">
                  {renderTextWithLinks(content)}
                </p>
                {allUrls.length > 0 && (
                  <div className="mt-3 space-y-3">
                    {allUrls.map((u, i) => (
                      <motion.div
                        key={`emb-${i}`}
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, ease: 'easeOut', delay: 0.1 + i * 0.1 }}
                      >
                        <EmbedRenderer url={u} />
                      </motion.div>
                    ))}
                  </div>
                )}
                {timestamp && (
                  <p className="text-[10px] text-white/40 text-right mt-1 whitespace-nowrap">{formatTime(timestamp)}</p>
                )}
              </div>
            </div>
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-red-500/80 to-red-700/80 flex items-center justify-center text-white font-semibold text-sm shrink-0 self-start">
              U
            </div>
          </div>
        )}
      </motion.div>
    );
  }

  // Agent avec contenu non vide.
  // PlaceCard (carousel) est rendu HORS bulle pour prendre toute la largeur (full-bleed).
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      className="flex flex-col w-full items-start gap-3"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchMove={handleTouchMove}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
    >
      <div className="flex items-start gap-2 max-w-[75%]">
        {selectionMode && checkbox}
        <div className="flex items-start gap-2">
          <div className="flex flex-col items-center gap-1 shrink-0">
            <div className="w-6 h-6 rounded-full bg-white/10 border border-white/10 flex items-center justify-center text-white/60 text-[10px] font-medium">
              A
            </div>
          </div>
          <div
            className={`border-l-2 border-white/15 pl-3 pr-2 py-1.5 min-w-0 ${
              isInRange ? 'ring-1 ring-red-400/50 rounded-lg' : ''
            }`}
            onClick={handleBubbleClick}
          >
            {!isJustUrl && (
              <p className="text-[14.5px] text-white/75 leading-relaxed whitespace-pre-wrap break-words">
                {renderTextWithLinks(content)}
              </p>
            )}
            {allUrls.length > 0 && (
              <div className="mt-3 space-y-3">
                {allUrls.map((u, i) => (
                  <motion.div
                    key={`emb-${i}`}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, ease: 'easeOut', delay: 0.1 + i * 0.1 }}
                  >
                    <EmbedRenderer url={u} />
                  </motion.div>
                ))}
              </div>
            )}
            {hasYoutubeField && (
              <YouTubeBlock
                youtube={youtube as YouTubeCardData | null}
                messageId={messageId}
              />
            )}
            {hasRecipe && (
              <div className="mt-3">
                <CardWithActions
                  cardKind="recipe"
                  cardData={recipe}
                  messageId={messageId}
                  title={(recipe as RecipeCardData)?.name}
                >
                  <RecipeCard recipe={recipe as RecipeCardData} />
                </CardWithActions>
              </div>
            )}
            {hasWikipedia && (
              <div className="mt-3">
                <CardWithActions
                  cardKind="wikipedia"
                  cardData={wikipedia}
                  messageId={messageId}
                  title={(wikipedia as WikipediaCardData)?.title}
                >
                  <WikipediaCard page={wikipedia as WikipediaCardData} />
                </CardWithActions>
              </div>
            )}
            {hasWeather && (
              <div className="mt-3">
                <CardWithActions
                  cardKind="weather"
                  cardData={weather}
                  messageId={messageId}
                  title={(weather as WeatherCardData)?.place_label || 'Météo'}
                >
                  <WeatherCard weather={weather as WeatherCardData} />
                </CardWithActions>
              </div>
            )}
            {hasWebSearch && (
              <div className="mt-3">
                <CardWithActions
                  cardKind="web_search"
                  cardData={web_search}
                  messageId={messageId}
                  title="Recherche web"
                >
                  <SearchResultCard data={web_search as WebSearchData} />
                </CardWithActions>
              </div>
            )}
            {hasGeolocBubble && <GeolocRequestBubble />}
            {timestamp && (
              <p className="text-[10px] text-white/30 text-right mt-1">{formatTime(timestamp)}</p>
            )}
          </div>
        </div>
      </div>
      {/* PlaceCard full-bleed : sort de la bulle 75% pour le ruban scrollable */}
      {hasPlaces && (
        <div className="w-full">
          <CardWithActions
            cardKind="place"
            cardData={{ places, intent_query, user_lat, user_lng }}
            messageId={messageId}
            title={intent_query || 'Lieux'}
          >
            <PlaceCard
              places={places as PlaceCardData[]}
              intentQuery={intent_query}
              userLat={user_lat}
              userLng={user_lng}
            />
          </CardWithActions>
        </div>
      )}
      {/* ProductCard full-bleed */}
      {hasProducts && (
        <div className="w-full">
          <CardWithActions
            cardKind="product"
            cardData={products}
            messageId={messageId}
            title="Produits"
          >
            <ProductCard products={products as ProductCardData[]} allowCreate />
          </CardWithActions>
        </div>
      )}
    </motion.div>
  );
};

export default MessageBubble;
