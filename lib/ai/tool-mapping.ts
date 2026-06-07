/**
 * Talk2Me #422 (Pascal 2026-06-07) — AI Core : mapping outils → cards UNIQUE.
 *
 * Avant, `mapResultsToResponse` + `safeParseArgs` + les types étaient DUPLIQUÉS
 * à l'identique ("mirror") dans /api/chat ET conversations/[id]/messages. Pascal
 * a demandé d'unifier l'exécution outils/cards. Ce module est désormais la
 * source unique : les deux routes l'importent.
 */

import type { AnyToolResult } from '@/lib/tools/handlers';
import type {
  YouTubeCardData,
  RecipeCardData,
  ProductCardData,
  PlaceCardData,
  PlaceSearchSpec,
  WebSearchData,
  TikTokCardData,
} from '@/lib/chat-types';
import type { WikipediaCardData } from '@/lib/wikipedia-search';
import type { WeatherCardData } from '@/lib/weather';
import type { WebSearchResult } from '@/lib/web-search';

export interface ToolCallExec {
  name: string;
  args: Record<string, unknown>;
  result: AnyToolResult;
  callId: string;
}

export interface MappedResponse {
  youtube?: YouTubeCardData | null;
  placeSearch?: PlaceSearchSpec;
  places?: PlaceCardData[];
  intent_query?: string;
  intent_label_fr?: string;
  user_lat?: number;
  user_lng?: number;
  recipe?: RecipeCardData | null;
  products?: ProductCardData[] | null;
  wikipedia?: WikipediaCardData | null;
  weather?: WeatherCardData | null;
  web_search?: WebSearchData | null;
  /** Talk2Me search_tiktok (Pascal 2026-06-04) — vidéo safe filtrée 5 garde-fous. */
  tiktok?: TikTokCardData | null;
}

/** Parse robuste des args JSON d'un tool_call DeepSeek (jamais throw). */
export function safeParseArgs(raw: string | undefined | null): Record<string, unknown> {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw);
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** Transforme les résultats d'exécution des tools en cards pour le front. */
export function mapResultsToResponse(execs: ToolCallExec[]): MappedResponse {
  const out: MappedResponse = {};
  for (const exec of execs) {
    const { name, result } = exec;
    if (name === 'search_youtube' || name === 'search_music') {
      // search_music = bibliothèque music-hub de l'user, rendu identique (YouTube).
      const r = result as { ok: boolean; video: YouTubeCardData | null };
      out.youtube = r.video;
    } else if (name === 'search_tiktok') {
      const r = result as { ok: boolean; tiktok: TikTokCardData | null };
      out.tiktok = r.tiktok;
    } else if (name === 'search_place') {
      const r = result as {
        ok: boolean;
        spec: PlaceSearchSpec;
        geocoded?: { lat: number; lng: number; display_name: string } | null;
        places?: PlaceCardData[];
        intent_query?: string;
        intent_label_fr?: string;
      };
      if (r.places && r.geocoded) {
        out.places = r.places;
        out.intent_query = r.intent_query;
        out.intent_label_fr = r.intent_label_fr;
        out.user_lat = r.geocoded.lat;
        out.user_lng = r.geocoded.lng;
      } else {
        out.placeSearch = r.spec;
      }
    } else if (name === 'search_recipe') {
      const r = result as { ok: boolean; recipe: RecipeCardData | null };
      out.recipe = r.recipe;
    } else if (name === 'search_product') {
      const r = result as { ok: boolean; products: ProductCardData[] };
      out.products = r.products.length > 0 ? r.products : [];
    } else if (name === 'search_wikipedia') {
      const r = result as { ok: boolean; page: WikipediaCardData | null };
      out.wikipedia = r.page;
    } else if (name === 'get_weather') {
      const r = result as { ok: boolean; weather: WeatherCardData | null };
      out.weather = r.weather;
    } else if (name === 'search_web') {
      const r = result as {
        ok: boolean;
        results: WebSearchResult[];
        source: 'brave' | 'bing' | 'ddg' | 'none';
      };
      if (r.results.length > 0) {
        out.web_search = {
          results: r.results.map((x) => ({
            title: x.title,
            url: x.url,
            snippet: x.snippet,
            source: x.source,
            favicon: x.favicon,
            thumbnail: x.thumbnail,
          })),
          source: r.source,
        };
      } else {
        out.web_search = null;
      }
    }
    // fetch_url_content : pas de card (DeepSeek a les data en round 2).
  }
  return out;
}
