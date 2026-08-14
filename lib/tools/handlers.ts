/**
 * Handlers des tools — mappés par nom au registry index.ts.
 * Chaque handler retourne un objet sérialisable JSON (renvoyé à DeepSeek
 * ET utilisé pour mapper vers les cards front).
 *
 * Doctrine no-excuses : si une recherche échoue, retourner un objet
 * structuré avec `ok:false` plutôt qu'une exception (DeepSeek pourra
 * décider de se taire ou de chaîner un autre tool).
 */

import OpenAI from 'openai';
import { searchYouTube } from '@/lib/youtube-search';
// Talk2Me #422 — Léa accède à la bibliothèque music-hub de l'utilisateur.
import {
  searchMusic as searchMusicHub,
  getByArtist as getMusicByArtist,
} from '@/lib/music-hub-client';
import { searchTiktok, type TikTokVideo } from '@/lib/tiktok-search';
import { searchRecipe, type RecipeCardData } from '@/lib/recipe-search';
import { searchProducts } from '@/lib/product-search';
import { getShopCards, createBoutique, createDirectCard, getStoreCatalog } from '@/lib/db';
import { shopSectionsState } from '@/lib/app-settings';
import { getPublishedAnnonces } from '@/lib/annonces-deposit';
import { getRestaurants } from '@/lib/annonces';
import { getBoutiqueTemplate } from '@/lib/boutique-templates';
import { searchWikipedia, type WikipediaCardData } from '@/lib/wikipedia-search';
import { getWeather, type WeatherCardData } from '@/lib/weather';
import { fetchUrlContent, type UrlContent } from '@/lib/playwright-fetch';
import { searchWeb, type WebSearchResult } from '@/lib/web-search';
import type {
  YouTubeCardData,
  TikTokCardData,
  PlaceCardData,
  PlaceSearchSpec,
  AmenityType,
  ProductCardData,
} from '@/lib/chat-types';

const AMENITY_WHITELIST: ReadonlyArray<AmenityType> = [
  'restaurant',
  'cafe',
  'pharmacy',
  'bakery',
  'bar',
  'pub',
  'fast_food',
  'hospital',
  'clinic',
  'doctors',
  'dentist',
  'school',
  // Hôtels / hébergements (taggés `tourism=*` côté OSM — traduit dans
  // l'endpoint /api/search/place via AMENITY_OSM_TAG).
  'hotel',
  'motel',
  'guest_house',
  'hostel',
];

const CATEGORY_OF: Record<AmenityType, 'food' | 'drink' | 'place'> = {
  restaurant: 'food',
  fast_food: 'food',
  bakery: 'food',
  cafe: 'drink',
  bar: 'drink',
  pub: 'drink',
  pharmacy: 'place',
  hospital: 'place',
  clinic: 'place',
  doctors: 'place',
  dentist: 'place',
  school: 'place',
  hotel: 'place',
  motel: 'place',
  guest_house: 'place',
  hostel: 'place',
};

// === Types des résultats handlers (servent au mapping côté route.ts) ===

export interface YoutubeToolResult {
  ok: boolean;
  video: YouTubeCardData | null;
}

export interface TiktokToolResult {
  ok: boolean;
  /** Vidéo TikTok safe retournée (cap 1, garde-fou 5). null si refus. */
  tiktok: TikTokCardData | null;
  /**
   * Raison du refus si ok=false. Valeurs :
   *   'query_out_of_safe_categories' | 'tikwm_failed' | 'no_safe_results'
   *   | 'empty_query'
   */
  reason?: string;
}

/**
 * Pour `search_place`, on N'EXÉCUTE PAS Overpass côté serveur quand on n'a
 * pas de coordonnées : le front a besoin de la géoloc nav (cf store/chat.ts).
 * On renvoie donc une `PlaceSearchSpec` à exécuter côté client, optionnellement
 * pré-géocodée si city était fournie.
 */
export interface PlaceToolResult {
  ok: boolean;
  /** Spec à exécuter côté client (front gère geoloc/géocodage). */
  spec: PlaceSearchSpec;
  /** Coordonnées résolues côté serveur si city fournie et géocodée. */
  geocoded?: { lat: number; lng: number; display_name: string } | null;
  /** Liste de lieux pré-fetchée côté serveur si geocoded != null. */
  places?: PlaceCardData[];
  intent_query?: string;
  intent_label_fr?: string;
}

export interface RecipeToolResult {
  ok: boolean;
  recipe: RecipeCardData | null;
}

export interface WikipediaToolResult {
  ok: boolean;
  page: WikipediaCardData | null;
}

export interface WeatherToolResult {
  ok: boolean;
  weather: WeatherCardData | null;
}

export interface UrlContentToolResult {
  ok: boolean;
  content: UrlContent | null;
}

export interface ProductToolResult {
  ok: boolean;
  products: ProductCardData[];
}

export interface WebSearchToolResult {
  ok: boolean;
  results: WebSearchResult[];
  source: 'brave' | 'bing' | 'ddg' | 'none';
}

export type AnyToolResult =
  | YoutubeToolResult
  | TiktokToolResult
  | PlaceToolResult
  | RecipeToolResult
  | WikipediaToolResult
  | WeatherToolResult
  | ProductToolResult
  | WebSearchToolResult
  | UrlContentToolResult;

// === Helpers ===

/** Appel interne au serveur Next pour géocoder une ville. */
async function geocodeCityInternal(
  baseUrl: string,
  city: string,
): Promise<{ lat: number; lng: number; display_name: string } | null> {
  try {
    const res = await fetch(`${baseUrl}/api/geocode?city=${encodeURIComponent(city)}`);
    if (!res.ok) return null;
    const data = await res.json();
    if (
      data &&
      typeof data.lat === 'number' &&
      typeof data.lng === 'number' &&
      Number.isFinite(data.lat) &&
      Number.isFinite(data.lng)
    ) {
      return {
        lat: data.lat,
        lng: data.lng,
        display_name: typeof data.display_name === 'string' ? data.display_name : city,
      };
    }
    return null;
  } catch {
    return null;
  }
}

/** Appel interne au serveur Next pour fetcher des places via Overpass. */
async function fetchPlacesInternal(
  baseUrl: string,
  lat: number,
  lng: number,
  amenity: AmenityType,
): Promise<{
  places: PlaceCardData[];
  intent_query: string;
  intent_label_fr: string;
} | null> {
  const category = CATEGORY_OF[amenity] ?? 'any';
  try {
    const params = new URLSearchParams({
      lat: String(lat),
      lng: String(lng),
      category,
      amenity,
      radius: '1500',
      limit: '6',
    });
    const res = await fetch(`${baseUrl}/api/search/place?${params.toString()}`);
    if (!res.ok) return null;
    const data = await res.json();
    return {
      places: Array.isArray(data?.places) ? (data.places as PlaceCardData[]) : [],
      intent_query: typeof data?.intent_query === 'string' ? data.intent_query : amenity,
      intent_label_fr:
        typeof data?.intent_label_fr === 'string' ? data.intent_label_fr : amenity,
    };
  } catch {
    return null;
  }
}

// === TikTok safety layer (Pascal 2026-06-04, 5 garde-fous empilés) ===
// Doctrine [[talktome-embeds-only]] + [[feedback_content_grounding]] +
// [[talk2me-ai-consciousness-core]]. Pascal verbatim : "dans tik tok ya plein
// de merde jai peur que si on laisse lia faire elle va sugerer plein de merde".
//
// On empile 5 filtres :
//   1. Whitelist catégories sur la query (refuse l'appel direct si hors scope)
//   2. Seuil popularité min sur chaque vidéo tikwm
//   3. Blacklist hashtags + mots-clés titre
//   4. Validation IA pré-affichage (DeepSeek light, fail-safe REJECT)
//   5. Cap 1 seul résultat retourné

const TIKTOK_ALLOWED_CATEGORIES: ReadonlyArray<string> = [
  // Cuisine
  'cuisine', 'recette', 'cooking', 'chef', 'food', 'patissier', 'patisserie',
  // Sport
  'sport', 'foot', 'football', 'basket', 'tennis', 'fitness', 'workout', 'yoga', 'running',
  // Voyage
  'voyage', 'travel', 'destination', 'plage', 'montagne', 'ville', 'roadtrip',
  // Musique
  'musique', 'music', 'chanson', 'song', 'artiste', 'concert', 'cover', 'remix',
  // Éducation
  'education', 'apprendre', 'astuce', 'tutoriel', 'tuto', 'tutorial', 'how to', 'science',
  // Animaux
  'animaux', 'chien', 'chat', 'cat', 'dog', 'animal', 'pet',
  // Humour bon enfant
  'humour', 'humor', 'funny', 'drole', 'rire', 'comique', 'comedy',
  // Lifestyle
  'lifestyle', 'mode', 'fashion', 'beauty', 'beaute', 'deco', 'decoration', 'maison', 'jardin',
  // Tech
  'tech', 'technology', 'iphone', 'android', 'gadget', 'review', 'unboxing',
  // Art
  'art', 'dessin', 'drawing', 'peinture', 'painting', 'photographie',
];

const TIKTOK_BLACKLIST_HASHTAGS: ReadonlyArray<string> = [
  // NSFW / sexualité
  'nsfw', 'sex', 'sexy', 'porn', 'onlyfans', 'nude', 'naked', 'thirst', 'thirsttrap',
  // Drogue
  'drug', 'drugs', 'weed', 'cocaine', 'meth', 'cannabis', 'shroom', 'lsd',
  // Violence
  'violence', 'fight', 'gun', 'weapon', 'kill', 'death', 'gore', 'blood',
  // Politique controversée
  'trump', 'biden', 'macron', 'lepen', 'melenchon', 'politique', 'politics', 'election',
  // Drama / haine
  'drama', 'tea', 'expose', 'cancel', 'beef', 'haine', 'racism', 'racist',
  // Désinformation
  'fakenews', 'conspiracy', 'hoax', 'illuminati', '5g', 'flatearth',
  // Religion controversée
  'islam', 'christian', 'jewish', 'religion',
  // Suicide / autoharm
  'suicide', 'selfharm', 'depression', 'mentalhealth', 'eating_disorder',
];

const TIKTOK_POPULARITY_MIN_LIKES = 10_000;
const TIKTOK_POPULARITY_MIN_VIEWS = 50_000;
const TIKTOK_RAW_SCRAPE_COUNT = 10; // demande tikwm large pour avoir du choix
const TIKTOK_VALIDATION_TIMEOUT_MS = 3000;

function isQueryInAllowedCategory(query: string): boolean {
  if (!query) return false;
  const q = query.toLowerCase();
  return TIKTOK_ALLOWED_CATEGORIES.some((cat) => q.includes(cat));
}

function meetsPopularityThreshold(v: TikTokVideo): boolean {
  const likes = typeof v.digg_count === 'number' ? v.digg_count : 0;
  const views = typeof v.play_count === 'number' ? v.play_count : 0;
  return likes >= TIKTOK_POPULARITY_MIN_LIKES || views >= TIKTOK_POPULARITY_MIN_VIEWS;
}

function hasBlacklistedContent(v: TikTokVideo): boolean {
  const title = (v.title || '').toLowerCase();
  if (!title) return false;
  // Extract hashtags from title
  const hashtagMatches = title.match(/#[a-z0-9_]+/g) || [];
  const hashtags = hashtagMatches.map((h) => h.slice(1));
  if (hashtags.some((h) => TIKTOK_BLACKLIST_HASHTAGS.includes(h))) return true;
  // Check raw substring on title (covers spelled-out blacklist words)
  if (TIKTOK_BLACKLIST_HASHTAGS.some((b) => title.includes(b))) return true;
  return false;
}

/**
 * Garde-fou 4 — Validation IA pré-affichage.
 * DeepSeek light, JSON strict {safe: bool, reason}. Fail-safe REJECT par défaut
 * (mieux vaut pas afficher que afficher du mauvais). Timeout 3s, no retry.
 */
async function validateTiktokSafe(
  v: TikTokVideo,
): Promise<{ safe: boolean; reason: string }> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    // Pas de clé : fail-safe REJECT (Pascal préfère un faux négatif à un faux positif)
    return { safe: false, reason: 'no_api_key' };
  }
  const title = (v.title || '').slice(0, 240);
  const userId = (v.user || 'unknown').slice(0, 60);
  const nickname = (v.user_nickname || '').slice(0, 60);
  const prompt = `Évalue si cette vidéo TikTok est appropriée à afficher dans une app conversationnelle grand public. RÈGLES : pas de NSFW, drogue, violence, politique clivante, drama haineux, désinformation, suicide. Catégories OK : cuisine, sport, voyage, musique, éducation, animaux, humour bon enfant, lifestyle, tech, art.

Titre: "${title}"
Auteur: "${userId} (${nickname})"

Réponds STRICTEMENT JSON {"safe": true|false, "reason": "<court>"}. Pas de markdown.`;
  try {
    const openai = new OpenAI({
      apiKey,
      baseURL: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
      timeout: TIKTOK_VALIDATION_TIMEOUT_MS,
      maxRetries: 0,
    });
    const completion = await openai.chat.completions.create({
      model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.0,
      max_tokens: 50,
    });
    const raw = (completion.choices[0]?.message?.content || '').trim();
    if (!raw) return { safe: false, reason: 'empty_response' };
    // Tolère ```json ... ```
    const cleaned = raw
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '')
      .trim();
    const json = JSON.parse(cleaned) as { safe?: unknown; reason?: unknown };
    const safe = json.safe === true;
    const reason =
      typeof json.reason === 'string' ? json.reason.slice(0, 120) : 'no_reason';
    return { safe, reason };
  } catch (e) {
    // Fail-safe : si DeepSeek down/parse fail, on refuse par défaut
    console.warn('[tiktok/validate] failed → reject:', (e as Error).message);
    return { safe: false, reason: 'validation_failed' };
  }
}

// === HANDLERS ===

export interface HandlerCtx {
  baseUrl: string;
  /** Talk2Me #418 — Context user/conv pour les side-effect tools (start_game). */
  userId?: string;
  convId?: string;
  convPeerId?: string | null;
  sessionToken?: string;
}

export const HANDLERS: Record<
  string,
  (args: Record<string, unknown>, ctx: HandlerCtx) => Promise<AnyToolResult>
> = {
  search_youtube: async (args) => {
    const query = typeof args.query === 'string' ? args.query.trim() : '';
    if (!query) return { ok: false, video: null };
    const result = await searchYouTube(query);
    if ('video' in result) {
      return { ok: true, video: result.video };
    }
    return { ok: false, video: null };
  },

  // Talk2Me #422 (Pascal 2026-06-07) — Léa puise dans la BIBLIOTHÈQUE music-hub
  // de l'utilisateur (ses sons curatés/scorés). Les tracks sont des vidéos
  // YouTube → on les mappe en YouTubeCardData (même rendu/lecteur). Fallback
  // search_youtube si rien dans la biblio.
  search_music: async (args) => {
    const query = typeof args.query === 'string' ? args.query.trim() : '';
    if (!query) return { ok: false, video: null };
    const toCard = (t: { youtube_video_id: string; title: string; artist_name?: string | null; channel_title?: string | null; thumbnail_url?: string | null }): YouTubeCardData => ({
      video_id: t.youtube_video_id,
      title: t.title,
      channel: t.artist_name || t.channel_title || '',
      description: t.artist_name || '',
      thumbnail: t.thumbnail_url || `https://i.ytimg.com/vi/${t.youtube_video_id}/hqdefault.jpg`,
      is_music: true, // → rendu disque vinyle dans le chat
    });
    try {
      // 1) Match ARTISTE d'abord (pertinent : "Lil Durk" → ses sons, pas du FTS flou).
      const byArtist = await getMusicByArtist(query, 1);
      const a = byArtist.tracks && byArtist.tracks[0];
      if (a && a.youtube_video_id) return { ok: true, video: toCard(a) };
      // 2) Sinon recherche plein-texte (titre + artiste).
      const r = await searchMusicHub(query, 1);
      const t = r.tracks && r.tracks[0];
      if (t && t.youtube_video_id) return { ok: true, video: toCard(t) };
    } catch {
      /* music-hub indispo → fallback YouTube */
    }
    // Fallback : recherche YouTube générique si rien dans la biblio.
    const result = await searchYouTube(query);
    if ('video' in result) return { ok: true, video: result.video };
    return { ok: false, video: null };
  },

  /**
   * search_tiktok — 5 garde-fous empilés (Pascal 2026-06-04).
   *
   * 1. Whitelist catégories sur la query (refuse si hors safe-list)
   * 2. tikwm scrape 10 résultats pour avoir du choix
   * 3. Filtre popularité (>= 10k likes OU 50k vues)
   * 4. Filtre blacklist hashtags + mots-clés titre
   * 5. Validation IA DeepSeek light (fail-safe REJECT)
   * 6. Cap 1 seul résultat (Pascal verbatim : pas de scroll TikTok)
   *
   * Si refus : caller chaîne fallback (search_web "tiktok <query>") via
   * la doctrine no-excuses, jamais d'invention.
   */
  search_tiktok: async (args) => {
    const query = typeof args.query === 'string' ? args.query.trim() : '';
    if (!query) {
      return { ok: false, tiktok: null, reason: 'empty_query' };
    }

    // Garde-fou 1 : whitelist catégories sur la query
    if (!isQueryInAllowedCategory(query)) {
      console.log(
        '[handler/search_tiktok] refusé : query hors catégories safe',
        `query="${query.slice(0, 60)}"`,
      );
      return { ok: false, tiktok: null, reason: 'query_out_of_safe_categories' };
    }

    // Scrape tikwm large (10 vidéos) pour avoir de la marge après filtres
    const raw = await searchTiktok(query, TIKTOK_RAW_SCRAPE_COUNT);
    if (!raw || raw.length === 0) {
      console.log('[handler/search_tiktok] tikwm KO ou vide', `query="${query.slice(0, 60)}"`);
      return { ok: false, tiktok: null, reason: 'tikwm_failed' };
    }

    // Itère : popularité → blacklist → validation IA. Stop au 1er qui passe.
    let inspected = 0;
    let droppedPopularity = 0;
    let droppedBlacklist = 0;
    let droppedAi = 0;
    for (const v of raw) {
      inspected++;
      // Garde-fou 2 : popularité
      if (!meetsPopularityThreshold(v)) {
        droppedPopularity++;
        continue;
      }
      // Garde-fou 3 : blacklist hashtags + mots-clés
      if (hasBlacklistedContent(v)) {
        droppedBlacklist++;
        continue;
      }
      // Garde-fou 4 : validation IA pré-affichage (DeepSeek light, fail-safe REJECT)
      const verdict = await validateTiktokSafe(v);
      if (!verdict.safe) {
        droppedAi++;
        console.log(
          '[handler/search_tiktok] AI reject',
          `video_id=${v.video_id}`,
          `reason=${verdict.reason}`,
        );
        continue;
      }
      // Garde-fou 5 : cap 1 → on retourne le PREMIER qui passe tout
      console.log(
        '[handler/search_tiktok] SAFE',
        `video_id=${v.video_id}`,
        `inspected=${inspected}/${raw.length}`,
        `dropped pop=${droppedPopularity} bl=${droppedBlacklist} ai=${droppedAi}`,
      );
      const tiktokCard: TikTokCardData = {
        video_id: v.video_id,
        user: v.user,
        user_nickname: v.user_nickname,
        title: v.title,
        cover_url: v.cover_url,
        original_url: v.original_url,
        play_count: v.play_count,
        digg_count: v.digg_count,
        duration: v.duration,
      };
      return { ok: true, tiktok: tiktokCard };
    }

    console.log(
      '[handler/search_tiktok] no_safe_results',
      `query="${query.slice(0, 60)}"`,
      `inspected=${inspected}`,
      `dropped pop=${droppedPopularity} bl=${droppedBlacklist} ai=${droppedAi}`,
    );
    return { ok: false, tiktok: null, reason: 'no_safe_results' };
  },

  search_place: async (args, ctx) => {
    const amenityRaw = typeof args.amenity === 'string' ? args.amenity.toLowerCase() : '';
    const amenity = (AMENITY_WHITELIST as readonly string[]).includes(amenityRaw)
      ? (amenityRaw as AmenityType)
      : ('restaurant' as AmenityType);
    const cityRaw = args.city;
    const city =
      typeof cityRaw === 'string' && cityRaw.trim().length > 0 && cityRaw.toLowerCase() !== 'null'
        ? cityRaw.trim().slice(0, 80)
        : null;
    const category = CATEGORY_OF[amenity] ?? 'any';
    const spec: PlaceSearchSpec = {
      type: 'place',
      category,
      amenity,
      city,
    };

    // Si ville fournie → géocoder + fetch Overpass côté serveur direct
    if (city) {
      const geo = await geocodeCityInternal(ctx.baseUrl, city);
      if (geo) {
        const placesRes = await fetchPlacesInternal(ctx.baseUrl, geo.lat, geo.lng, amenity);
        if (placesRes) {
          return {
            ok: true,
            spec,
            geocoded: geo,
            places: placesRes.places,
            intent_query: placesRes.intent_query,
            intent_label_fr: placesRes.intent_label_fr,
          };
        }
        // Géocodé mais Overpass KO → on laisse front re-tenter
        return { ok: true, spec, geocoded: geo, places: [] };
      }
      // Géocodage KO : on retombe sur spec à exécuter côté client
      return { ok: true, spec, geocoded: null };
    }

    // Pas de ville → front gère via geoloc nav
    return { ok: true, spec };
  },

  search_recipe: async (args) => {
    const query = typeof args.query === 'string' ? args.query.trim() : '';
    if (!query) return { ok: false, recipe: null };
    const recipe = await searchRecipe(query);
    return { ok: !!recipe, recipe };
  },

  search_wikipedia: async (args) => {
    const topic = typeof args.topic === 'string' ? args.topic.trim() : '';
    if (!topic) return { ok: false, page: null };
    const lang = typeof args.lang === 'string' ? args.lang.trim() : 'fr';
    const page = await searchWikipedia(topic, lang);
    return { ok: !!page, page };
  },

  get_weather: async (args, ctx) => {
    let lat = typeof args.lat === 'number' ? args.lat : NaN;
    let lng = typeof args.lng === 'number' ? args.lng : NaN;
    const city = typeof args.city === 'string' ? args.city.trim() : '';
    let placeLabel: string | null = null;
    if ((!Number.isFinite(lat) || !Number.isFinite(lng)) && city) {
      const geo = await geocodeCityInternal(ctx.baseUrl, city);
      if (geo) {
        lat = geo.lat;
        lng = geo.lng;
        placeLabel = geo.display_name;
      }
    } else if (Number.isFinite(lat) && Number.isFinite(lng) && city) {
      placeLabel = city;
    }
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return { ok: false, weather: null };
    }
    const weather = await getWeather(lat, lng, placeLabel);
    return { ok: !!weather, weather };
  },

  search_product: async (args) => {
    const query = typeof args.query === 'string' ? args.query.trim() : '';
    if (!query) return { ok: false, products: [] };
    const shipsTo = typeof args.ships_to === 'string' ? args.ships_to.trim().toUpperCase().slice(0, 2) : undefined;
    try {
      const list = await searchProducts(query, 5, shipsTo ? { shipsTo } : undefined);
      return { ok: list.length > 0, products: list };
    } catch (e) {
      console.error('[handler/search_product]', e);
      return { ok: false, products: [] };
    }
  },

  // Talk2Me #427 — offres de la COMMUNAUTÉ/artisans (cards-produit des users).
  // Les offres BOOSTÉES sont remontées en premier (le boost achète la reco de
  // Léa). La reco crédite l'owner de l'offre (il a payé) via t2m_ref.
  search_shop: async (args) => {
    const query = typeof args.query === 'string' ? args.query.trim().toLowerCase() : '';
    try {
      let cards = getShopCards(Date.now(), 10);
      if (query) {
        const filtered = cards.filter((c) => {
          try {
            const p = JSON.parse(c.attached_product_json || '{}');
            const hay = `${p.title ?? ''} ${c.caption ?? ''} ${c.text ?? ''}`.toLowerCase();
            return hay.includes(query);
          } catch {
            return false;
          }
        });
        if (filtered.length) cards = filtered; // sinon : on garde les boostées (favorisées)
      }
      const products = cards
        .map((c): ProductCardData | null => {
          let p: ProductCardData | null = null;
          try {
            p = JSON.parse(c.attached_product_json || '{}') as ProductCardData;
          } catch {
            return null;
          }
          if (!p || !p.title) return null;
          let url = p.source_url;
          if (url && c.user_id) {
            try {
              const u = new URL(url);
              u.searchParams.set('t2m_ref', c.user_id); // crédite l'owner (offre boostée)
              url = u.toString();
            } catch {
              /* garde url brute */
            }
          }
          return { ...p, source_url: url };
        })
        .filter((p): p is ProductCardData => !!p)
        .slice(0, 5);
      return { ok: products.length > 0, products };
    } catch (e) {
      console.error('[handler/search_shop]', e);
      return { ok: false, products: [] };
    }
  },

  // Catalogue de la BOUTIQUE principale (DB shop). Gaté par l'interrupteur admin :
  // si l'admin a désactivé Boutique, Léa NE LA VOIT PAS.
  search_boutique: async (args) => {
    if (!shopSectionsState().boutique) return { ok: false, products: [] };
    const query = typeof args.query === 'string' ? args.query.trim().toLowerCase() : '';
    try {
      const cats = getStoreCatalog(0);
      let flat = cats.flatMap((c) => c.products.map((p) => ({ ...p, category: c.category })));
      const tk = query.split(/[\s,]+/).filter((t) => t.length > 1);
      if (tk.length) flat = flat.filter((p) => { const h = `${p.title} ${p.category}`.toLowerCase(); return tk.every((t) => h.includes(t)); });
      const products: ProductCardData[] = flat.slice(0, 6).map((p) => ({
        id: 'boutique:' + p.id, title: p.title, image_url: p.image, price_label: p.price_label,
        currency: null, source: 'Talk2Me', source_url: '/shop', condition: null,
      }));
      return { ok: products.length > 0, products };
    } catch (e) { console.error('[handler/search_boutique]', e); return { ok: false, products: [] }; }
  },

  // ANNONCES déposées (DB annonces). Gaté par l'interrupteur admin Annonces.
  // Matching par MOTS (ET) sur titre+description+catégorie → la description contient
  // les détails (couleur, taille, marque…), donc « pantalon L rouge » matche.
  // On RENVOIE la description pour que Léa lise tous les détails et confirme.
  search_annonces: async (args) => {
    if (!shopSectionsState().annonces) return { ok: false, products: [] };
    const query = typeof args.query === 'string' ? args.query.trim().toLowerCase() : '';
    const category = typeof args.category === 'string' ? args.category.trim() : '';
    const tokens = query.split(/[\s,]+/).filter((t) => t.length > 1);
    try {
      let rows = getPublishedAnnonces(category ? { category } : {});
      if (tokens.length) {
        rows = rows.filter((a) => {
          const hay = `${a.title} ${a.description ?? ''} ${a.category} ${a.city ?? ''}`.toLowerCase();
          return tokens.every((t) => hay.includes(t));
        });
      }
      const products = rows.slice(0, 8).map((a) => ({
        id: 'annonce:' + a.id, title: a.title, image_url: a.image_url, price_label: a.price_label,
        currency: null, source: 'Talk2Me' as const, source_url: '/shop', condition: null,
        // Détails complets pour le raisonnement de Léa (couleur/taille/marque/état dans la desc).
        description: a.description ?? null, category: a.category, city: a.city ?? null,
      }));
      return { ok: products.length > 0, products };
    } catch (e) { console.error('[handler/search_annonces]', e); return { ok: false, products: [] }; }
  },

  // RESTAURANTS / plats internes (Eat). Gaté par l'interrupteur admin Eat.
  search_eat: async (args) => {
    if (!shopSectionsState().eat) return { ok: false, products: [] };
    const query = typeof args.query === 'string' ? args.query.trim().toLowerCase() : '';
    try {
      let restos = getRestaurants();
      const tk = query.split(/[\s,]+/).filter((t) => t.length > 1);
      if (tk.length) restos = restos.filter((r) => { const h = `${r.name} ${r.description ?? ''}`.toLowerCase(); return tk.every((t) => h.includes(t)); });
      const products: ProductCardData[] = restos.slice(0, 6).map((r) => ({
        id: 'eat:' + r.id, title: r.name, image_url: r.cover_url ?? null, price_label: null,
        currency: null, source: 'Talk2Me', source_url: `/b/${r.public_key}`, condition: null,
      }));
      return { ok: products.length > 0, products };
    } catch (e) { console.error('[handler/search_eat]', e); return { ok: false, products: [] }; }
  },

  /**
   * Talk2Me #428 — Léa monte la boutique de l'utilisateur depuis un template.
   * Side-effect : nécessite ctx.userId. Crée la boutique + 1 emplacement vide
   * par rayon (catégorie). N'invente AUCUN produit/prix (content-grounding).
   */
  create_boutique: async (args, ctx) => {
    const name = typeof args.name === 'string' ? args.name.trim().slice(0, 80) : '';
    const templateKey = typeof args.template === 'string' ? args.template : '';
    if (!ctx?.userId) return { ok: false, error: 'missing_user_context' } as unknown as AnyToolResult;
    if (!name) return { ok: false, error: 'name_required' } as unknown as AnyToolResult;
    const tpl = getBoutiqueTemplate(templateKey);
    if (!tpl) return { ok: false, error: 'unknown_template' } as unknown as AnyToolResult;
    try {
      const boutique = createBoutique(ctx.userId, { name }, Date.now());
      for (const category of tpl.categories) {
        createDirectCard(ctx.userId, {
          type: 'image',
          media_url: null,
          caption: 'Emplacement à compléter',
          boutique_id: boutique.id,
          category,
        });
      }
      const url = boutique.slug
        ? `https://talk2me.fr/${boutique.slug}`
        : `https://talk2me.fr/boutique/${boutique.id}`;
      return {
        ok: true,
        boutique: { id: boutique.id, name: boutique.name, slug: boutique.slug },
        template: tpl.name,
        categories: tpl.categories,
        emplacements: tpl.categories.length,
        url,
      } as unknown as AnyToolResult;
    } catch (e) {
      console.error('[handler/create_boutique]', e);
      return { ok: false, error: 'create_failed' } as unknown as AnyToolResult;
    }
  },

  search_web: async (args) => {
    const query = typeof args.query === 'string' ? args.query.trim() : '';
    if (!query) return { ok: false, results: [], source: 'none' };
    try {
      const out = await searchWeb(query, 5);
      return { ok: out.results.length > 0, results: out.results, source: out.source };
    } catch (e) {
      console.error('[handler/search_web]', e);
      return { ok: false, results: [], source: 'none' };
    }
  },

  fetch_url_content: async (args) => {
    const url = typeof args.url === 'string' ? args.url.trim() : '';
    if (!url) return { ok: false, content: null };
    const content = await fetchUrlContent(url);
    return { ok: !!content, content };
  },

  /**
   * Talk2Me #419 — Rappelle le dernier coup joué dans la partie en cours.
   * Pascal verbatim : "si je lui dit attent ta jouer ou elle me montre son dernier coup".
   * Cherche la partie in_progress dans la conv courante et retourne le dernier SAN.
   */
  recall_last_move: async (args, ctx) => {
    const gameKind = typeof args.game_kind === 'string' ? args.game_kind : '';
    if (gameKind !== 'chess' && gameKind !== 'dame') {
      return { ok: false, error: 'invalid_game_kind' } as unknown as AnyToolResult;
    }
    if (!ctx.convId) {
      return { ok: false, error: 'missing_conv_context' } as unknown as AnyToolResult;
    }
    try {
      const { getDb } = await import('@/lib/db');
      const db = getDb();
      const table = gameKind === 'chess' ? 'chess_games' : 'dame_games';
      const row = db
        .prepare(
          `SELECT id, moves, fen FROM ${table} WHERE conv_id = ? AND status = 'in_progress' ORDER BY started_at DESC LIMIT 1`,
        )
        .get(ctx.convId) as { id: string; moves: string; fen?: string } | undefined;
      if (!row) {
        return { ok: false, error: 'no_active_game' } as unknown as AnyToolResult;
      }
      let movesArr: string[] = [];
      try {
        movesArr = JSON.parse(row.moves || '[]');
      } catch {
        movesArr = [];
      }
      const lastMove = movesArr.length > 0 ? movesArr[movesArr.length - 1] : null;
      return {
        ok: true,
        game_id: row.id,
        last_move: lastMove,
        total_moves: movesArr.length,
        game_kind: gameKind,
      } as unknown as AnyToolResult;
    } catch (e) {
      console.error('[handler/recall_last_move]', e);
      return { ok: false, error: (e as Error).message } as unknown as AnyToolResult;
    }
  },

  /**
   * Talk2Me #418 — Lance une partie d'échecs ou de dames dans la conv.
   * Side-effect tool : nécessite ctx.userId + ctx.convId pour fonctionner.
   * En conv P2P avec un ami : Léa pose le plateau en mode arbitre (ne joue pas).
   * En conv solo Léa : opponent='lea' (Léa joue).
   */
  start_game: async (args, ctx) => {
    const gameKind = typeof args.game_kind === 'string' ? args.game_kind : '';
    const intent = typeof args.intent === 'string' ? args.intent : 'auto';
    if (gameKind !== 'chess' && gameKind !== 'dame') {
      return { ok: false, error: 'invalid_game_kind' } as unknown as AnyToolResult;
    }
    if (!ctx.userId || !ctx.convId) {
      return { ok: false, error: 'missing_user_or_conv_context' } as unknown as AnyToolResult;
    }
    try {
      const { triggerGameFromConv } = await import('@/lib/games/lea-trigger');
      const result = await triggerGameFromConv({
        user_id: ctx.userId,
        conv_id: ctx.convId,
        conv_peer_id: ctx.convPeerId ?? null,
        game_kind: gameKind as 'chess' | 'dame',
        intent: (intent === 'new' || intent === 'resume' ? intent : 'auto') as
          | 'new'
          | 'resume'
          | 'auto',
      });
      if (!result.ok) {
        return { ok: false, error: result.error } as unknown as AnyToolResult;
      }
      return { ok: true, game_id: result.game_id, existing: result.existing } as unknown as AnyToolResult;
    } catch (e) {
      console.error('[handler/start_game]', e);
      return { ok: false, error: (e as Error).message } as unknown as AnyToolResult;
    }
  },
};
