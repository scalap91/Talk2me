export type Role = 'user' | 'agent';

export interface YouTubeCardData {
  video_id: string;
  title: string;
  channel: string;
  description: string;
  thumbnail: string;
  /** Talk2Me #422 — true si vient de search_music (biblio user) → rendu disque vinyle. */
  is_music?: boolean;
}

/**
 * Talk2Me search_tiktok (Pascal 2026-06-04) — vidéo TikTok réelle, render
 * via iframe officielle `tiktok.com/embed.js`. Source : scrape miroir tikwm.
 * Doctrine [[talktome-embeds-only]] : on retransmet l'info brute, aucune
 * invention. La vidéo n'est PAS stockée — juste video_id + user pour le
 * lookup live à l'affichage.
 */
export interface TikTokCardData {
  video_id: string;
  user: string;
  user_nickname: string;
  title: string;
  cover_url: string | null;
  original_url: string;
  play_count: number | null;
  digg_count: number | null;
  duration: number | null;
}

export interface PlaceOpenStatus {
  is_open: boolean | null;
  label: string | null;
}

export interface PlaceCardData {
  name: string;
  category: string;
  cuisine: string | null;
  address: string | null;
  distance_m: number;
  maps_url: string;
  google_maps_url: string;
  /** URL Google Maps "directions" (lance l'itinéraire). */
  directions_url?: string;
  /** Lien "Plus" : site officiel OSM si présent, sinon page OSM. */
  source_url?: string;
  website?: string | null;
  phone?: string | null;
  /** Chaîne brute OSM (was `opening_hours`). Conservé pour compat. */
  opening_hours?: string | null;
  /** Idem renommé pour API v2. */
  opening_hours_raw?: string | null;
  /** Statut ouvert/fermé parsé. null si data absente ou parsing échoué. */
  open_status?: PlaceOpenStatus | null;
  /** Photo OSM (tag image / wikimedia_commons). null si absent. */
  image_url?: string | null;
  lat: number;
  lng: number;
}

/**
 * Search spec demandée par DeepSeek dans sa réponse JSON.
 * - type 'youtube' : exécution serveur (déjà gérée dans /api/chat)
 * - type 'place'   : exécution client (besoin géoloc navigateur)
 * - type 'recipe'  : exécution serveur (déjà gérée dans /api/chat)
 */
export type AmenityType =
  | 'restaurant'
  | 'cafe'
  | 'pharmacy'
  | 'bakery'
  | 'bar'
  | 'pub'
  | 'fast_food'
  | 'hospital'
  | 'clinic'
  | 'doctors'
  | 'dentist'
  | 'school'
  // Tourism (OSM `tourism=*`) — wrappés sous la clé sémantique `amenity` côté Talk2Me
  | 'hotel'
  | 'motel'
  | 'guest_house'
  | 'hostel';

export interface PlaceSearchSpec {
  type: 'place';
  category: 'food' | 'drink' | 'place' | 'any';
  /** OSM amenity ID exact pour Overpass (optionnel, prend le pas sur category). */
  amenity?: AmenityType;
  query?: string;
  city?: string | null;
}

export interface RecipeCardData {
  name: string;
  image: string | null;
  prep_time: string | null;
  servings: string | null;
  difficulty: string | null;
  ingredients: string[];
  description: string | null;
  source_url: string;
  source: 'marmiton' | 'cuisineaz';
}

/**
 * ProductCardData : objet conversationnel de découverte produit.
 *
 * Doctrine `talktome-card-vivante` : ce N'EST PAS un objet commercial.
 * Pas de checkout, pas d'affiliation visible au MVP. Juste un produit réel
 * issu d'une source publique (AliExpress en V1), affiché comme une card.
 *
 * Doctrine `retranscrire-api` : `price_label` est la string BRUTE renvoyée
 * par la source ("€ 114,21"). Jamais recalculé/converti côté serveur.
 */
export interface ProductCardData {
  id: string;
  title: string;
  image_url: string | null;
  price_label: string | null;
  currency: string | null;
  source: 'AliExpress' | 'Bing Shopping' | 'CJ' | 'Talk2Me' | 'SHEIN' | 'TEMU' | 'Banggood' | 'BigBuy';
  source_url: string;
  condition: 'neuf' | null;
}

/** Search spec demandée par DeepSeek (intent product). */
export interface ProductSearchSpec {
  type: 'product';
  query: string;
}

/**
 * Résultat de recherche web générique (search_web tool).
 * Doctrine retranscrire-api : title/url/snippet renvoyés tels que reçus
 * par Brave ou DuckDuckGo, jamais reformulés côté serveur.
 */
export interface WebSearchResultData {
  title: string;
  url: string;
  snippet: string;
  source?: string; // hostname (ex "ovh.com")
  favicon?: string;
  thumbnail?: string;
}

export interface WebSearchData {
  results: WebSearchResultData[];
  /** Origine des résultats : 'brave' (API), 'bing' (scrape), 'ddg' (scrape), 'none' (échec). */
  source: 'brave' | 'bing' | 'ddg' | 'none';
}

export interface ChatMessage {
  id: string;
  role: Role;
  content: string;
  /** Liens externes réels suggérés par l'agent (URLs http(s) uniquement). */
  links?: string[];
  /**
   * Donnée YouTube récupérée via /api/search/youtube quand l'utilisateur a demandé une vidéo.
   * - objet YouTubeCardData : vidéo trouvée → afficher la card riche
   * - null : recherche effectuée mais aucune vidéo fiable → afficher message d'erreur
   * - undefined : pas de recherche YT pour ce message
   */
  youtube?: YouTubeCardData | null;
  /**
   * Lieux retournés par OSM Overpass après exécution d'une PlaceSearchSpec
   * côté client (avec lat,lng réels). undefined si pas de recherche, [] si rien trouvé.
   */
  places?: PlaceCardData[] | null;
  /** True si l'agent attend que l'utilisateur active la géoloc avant d'exécuter la search. */
  requires_geoloc?: boolean;
  /** Search en attente d'exécution côté client (geoloc, géocodage). */
  pending_place_search?: PlaceSearchSpec;
  /** Mot-clé métier utilisé pour les deep-links Maps (ex: "pharmacie", "restaurant"). */
  intent_query?: string;
  /** Label UI pluriel (ex: "pharmacies", "boulangeries"). */
  intent_label_fr?: string;
  /** Position user au moment de la recherche (utilisée par PlaceCard pour deep-link Maps). */
  user_lat?: number;
  user_lng?: number;
  /**
   * Recette scrapée via /api/search/recipe (Marmiton ou Cuisine AZ).
   * - objet : recette trouvée → render RecipeCard native
   * - null : pas trouvé / scraping échoué → ne rien afficher (doctrine no-excuses)
   * - undefined : pas de recherche recipe pour ce message
   */
  recipe?: RecipeCardData | null;
  /**
   * Produits scrapés via /api/search/product (AliExpress).
   * - array non-vide : carousel ProductCards
   * - [] : scraping échoué OU rien trouvé (front silencieux, doctrine no-excuses)
   * - undefined : pas de recherche product pour ce message
   */
  products?: ProductCardData[] | null;
  /**
   * Article Wikipedia récupéré via le tool search_wikipedia.
   * - objet : render WikipediaCard
   * - null : pas trouvé (silence, doctrine no-excuses)
   * - undefined : pas d'appel wiki sur ce message
   */
  wikipedia?: import('./wikipedia-search').WikipediaCardData | null;
  /**
   * Météo actuelle récupérée via get_weather (Open-Meteo).
   * - objet : render WeatherCard
   * - null : pas trouvé
   * - undefined : pas d'appel météo sur ce message
   */
  weather?: import('./weather').WeatherCardData | null;
  /**
   * Résultats de search_web (Brave Search ou DuckDuckGo fallback).
   * - objet avec results.length > 0 : render SearchResultCard
   * - objet avec results vide : silence côté UI (doctrine no-excuses)
   * - null : pas trouvé (silence)
   * - undefined : pas d'appel search_web sur ce message
   */
  web_search?: WebSearchData | null;
  /**
   * Talk2Me search_tiktok (Pascal 2026-06-04) — vidéo TikTok proposée par
   * DeepSeek via le tool search_tiktok. Render TikTokEmbed (iframe officielle).
   */
  tiktok?: TikTokCardData | null;
  /**
   * Talk2Me média chat (Pascal 2026-06-04) — fichier joint au message
   * (image/vidéo/audio). Lecteur intégré + download dans la card UI.
   */
  media?: {
    url: string;
    type: 'image' | 'video' | 'audio';
    filename?: string | null;
    size?: number | null;
    mime?: string | null;
    poster?: string | null;
  } | null;
  timestamp?: number;
}

export interface ChatApiResponse {
  text: string;
  /** Liens réels vérifiables, jamais inventés. Optionnel. */
  links?: string[];
  /** Donnée YouTube en cas de recherche déclenchée par DeepSeek. */
  youtube?: YouTubeCardData | null;
  /** Spec de recherche place à exécuter côté client (besoin géoloc nav). */
  placeSearch?: PlaceSearchSpec;
  /** Recette scrapée serveur en cas d'intent recipe détecté par DeepSeek. */
  recipe?: RecipeCardData | null;
  /** Produits scrapés serveur en cas d'intent product détecté par DeepSeek. */
  products?: ProductCardData[] | null;
  /** Article Wikipedia (function calling search_wikipedia). */
  wikipedia?: import('./wikipedia-search').WikipediaCardData | null;
  /** Météo actuelle (function calling get_weather). */
  weather?: import('./weather').WeatherCardData | null;
  /** Résultats de recherche web générique (function calling search_web). */
  web_search?: WebSearchData | null;
  /** Vidéo TikTok (function calling search_tiktok). */
  tiktok?: TikTokCardData | null;
  /** Lieux pré-fetchés côté serveur quand DeepSeek a passé `city`. */
  places?: PlaceCardData[] | null;
  intent_query?: string;
  intent_label_fr?: string;
  user_lat?: number;
  user_lng?: number;
}
