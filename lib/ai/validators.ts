/**
 * Talk2Me #340 / Lot 4 — Validators post-result (Pascal 2026-06-04).
 *
 * Bouclier final (N12 Visual QA) avant affichage card / texte au user.
 *
 * Lot 1bis Couche B (#345) :
 *  - validateCardResult({ intent, card_kind, card_data, message_text }) → ok/reason/action
 *  - scrubForbiddenPhrases(text)
 *  - inferCardKind(mapped)
 *
 * Lot 4 N12 (Pascal master point 12) — durcissement :
 *  - validateIntentToolCard : intent ↔ tool ↔ card cohérence
 *  - validatePlaceCardAmenity : intent → expected_amenities, ≥50% match
 *  - detectCommittedPrice : pas de fourchette flight/hotel inventée
 *  - detectAmbiguousMotBrut : query ≤2 mots ET pas dans habits → clarify
 *  - visualQa : orchestrateur combinant toutes les règles
 *
 * Doctrine :
 *  - [[talk2me-ai-consciousness-core]] N12 Visual QA
 *  - [[talktome-no-excuses]] : pas d'excuse, pas de meta-commentaire
 *  - [[talktome-raisonnement-ia]] : pipeline silencieux
 *  - [[feedback_airbizness_no_committed_price]] transposé Talk2Me
 *  - [[feedback_content_grounding]] : pas d'invention de faits/prix
 */

import consciousness from './consciousness/consciousness.json';

export type ValidatorAction =
  | 'reject'
  | 'request_clarification'
  | 'clarify'
  | 'fallback';

export interface ValidateCardResultInput {
  intent: string | null;
  card_kind: string | null;
  card_data: unknown;
  message_text: string;
  /**
   * Talk2Me P3 #362 — tool effectivement appelé (premier exec.name).
   * Permet de détecter "card attendue mais vide" (ex Overpass places=[] →
   * inferCardKind retourne null mais on SAIT qu'on attendait une PlaceCard)
   * pour déclencher la fallback_chain même quand le payload est vide.
   */
  tool_used?: string | null;
}

export interface ValidateCardResultOutput {
  ok: boolean;
  reason?: string;
  action?: ValidatorAction;
}

const HOTEL_TAGS = new Set([
  'hotel',
  'motel',
  'guest_house',
  'hostel',
  'apartment',
  'chalet',
]);
const RESTO_TAGS = new Set([
  'restaurant',
  'cafe',
  'fast_food',
  'food_court',
  'bistro',
]);

function extractAmenity(place: unknown): string | null {
  if (!place || typeof place !== 'object') return null;
  const p = place as Record<string, unknown>;
  if (typeof p.amenity === 'string') return p.amenity;
  if (typeof p.category === 'string') return p.category;
  const tags = p.tags as Record<string, unknown> | undefined;
  if (tags) {
    if (typeof tags.amenity === 'string') return tags.amenity;
    if (typeof tags.tourism === 'string') return tags.tourism;
  }
  if (typeof p.tourism === 'string') return p.tourism;
  return null;
}

function placesArray(card_data: unknown): unknown[] {
  if (!card_data) return [];
  if (Array.isArray(card_data)) return card_data;
  if (typeof card_data === 'object') {
    const places = (card_data as Record<string, unknown>).places;
    if (Array.isArray(places)) return places;
  }
  return [];
}

export function validateCardResult(
  opts: ValidateCardResultInput,
): ValidateCardResultOutput {
  const { intent, card_data, message_text, tool_used } = opts;

  // Talk2Me P3 #362 — Si card_kind est null mais on connaît un tool_used
  // OU un intent qui appelle une card spécifique, on calcule le card_kind
  // ATTENDU. Ça permet de détecter "card attendue mais vide" (ex Overpass
  // 0 result) et de déclencher fallback_chain au lieu d'un silence.
  const effective_kind =
    opts.card_kind ||
    inferIntendedCardKind({ tool_used, intent }) ||
    null;

  // 1. Card kind présent mais data vide → fallback
  if (effective_kind && (card_data === null || card_data === undefined)) {
    return { ok: false, reason: 'Empty card data', action: 'fallback' };
  }
  if (effective_kind && Array.isArray(card_data) && card_data.length === 0) {
    return { ok: false, reason: 'Empty card array', action: 'fallback' };
  }
  // Cas spécifique PlaceCard : data peut être { places: [] } (forme objet
  // retournée par mapResultsToResponse). On rejette aussi.
  if (
    effective_kind === 'PlaceCard' &&
    card_data &&
    typeof card_data === 'object' &&
    !Array.isArray(card_data)
  ) {
    const places = (card_data as Record<string, unknown>).places;
    if (Array.isArray(places) && places.length === 0) {
      return {
        ok: false,
        reason: 'Empty PlaceCard places array',
        action: 'fallback',
      };
    }
  }
  // Lien direct avec le bug source : card_kind null + intent géo + 0 places.
  // On force le fallback même si card_data est carrément absent (undefined).
  if (
    !opts.card_kind &&
    effective_kind &&
    (card_data === undefined || card_data === null)
  ) {
    return {
      ok: false,
      reason: `Expected ${effective_kind} but tool returned empty payload`,
      action: 'fallback',
    };
  }

  // Pour la suite des règles, on utilise effective_kind (préserve le
  // comportement existant : card_kind concret prime).
  const card_kind = effective_kind;

  // 2. PlaceCard pour intent hotel → tous les lieux DOIVENT avoir un tag
  //    hôtel (sinon le user voit un resto/pharmacie quand il demande un hôtel).
  if (card_kind === 'PlaceCard' && intent === 'hotel') {
    const places = placesArray(card_data);
    const hasHotels = places.some((p) => {
      const a = extractAmenity(p);
      return a !== null && HOTEL_TAGS.has(a.toLowerCase());
    });
    if (!hasHotels) {
      return {
        ok: false,
        reason: 'PlaceCard returned non-hotel places for hotel intent',
        action: 'fallback',
      };
    }
  }

  // 3. PlaceCard pour intent restaurant → vérifier qu'on a bien des restos
  if (card_kind === 'PlaceCard' && intent === 'restaurant') {
    const places = placesArray(card_data);
    const hasRestos = places.some((p) => {
      const a = extractAmenity(p);
      return a !== null && RESTO_TAGS.has(a.toLowerCase());
    });
    if (!hasRestos) {
      return {
        ok: false,
        reason: 'PlaceCard returned non-restaurant for restaurant intent',
        action: 'fallback',
      };
    }
  }

  // 4. Card kind sans intent attendu → soft warning (on log mais on
  //    n'empêche pas) sauf cas pathologiques.
  if (card_kind && intent) {
    const cardConstraints = (
      consciousness.card_constraints as Record<
        string,
        { intent_required?: string[] }
      >
    )[card_kind];
    if (
      cardConstraints?.intent_required &&
      !cardConstraints.intent_required.includes(intent) &&
      // On laisse passer general_web → SearchResultCard (fallback générique).
      !(intent === 'general_web' && card_kind === 'SearchResultCard')
    ) {
      // Cas pathologique : intent youtube_video mais on a une PlaceCard
      // (sortie complètement à côté). On rejette.
      const mismatchedSerious =
        (intent === 'hotel' || intent === 'restaurant') &&
        card_kind !== 'PlaceCard' &&
        card_kind !== 'SearchResultCard';
      if (mismatchedSerious) {
        return {
          ok: false,
          reason: `Card ${card_kind} doesn't match intent ${intent}`,
          action: 'fallback',
        };
      }
    }
  }

  // 5. Card présente + text vide : on respecte la doctrine cards-primauté
  //    (text="" autorisé). On contrôle uniquement via min_text_with_card_chars
  //    qui vaut 0 par défaut. Si configuré > 0 par Pascal plus tard, on rejette.
  const minChars =
    typeof consciousness.min_text_with_card_chars === 'number'
      ? consciousness.min_text_with_card_chars
      : 0;
  if (
    minChars > 0 &&
    card_kind &&
    (!message_text || message_text.trim().length < minChars)
  ) {
    return {
      ok: false,
      reason: 'Card without conversational text',
      action: 'reject',
    };
  }

  return { ok: true };
}

/**
 * Retire les phrases entières qui contiennent un pattern interdit. Découpe
 * en phrases (séparateurs . ! ?) et drop la phrase entière. Si plus rien ne
 * reste, retourne string vide (le caller décidera quoi faire).
 */
export function scrubForbiddenPhrases(text: string): string {
  if (!text) return '';
  const patterns = (
    consciousness.forbidden_phrases as { patterns: string[] }
  ).patterns;
  if (!patterns || patterns.length === 0) return text;

  // Split en segments en gardant les séparateurs.
  // Regex : matche un segment = du texte jusqu'à un terminateur (./!/?) inclus,
  // ou la fin de chaîne.
  const segments = text.match(/[^.!?]+[.!?]?/g) || [text];
  const kept: string[] = [];
  for (const seg of segments) {
    const lower = seg.toLowerCase();
    const contains = patterns.some((p) => lower.includes(p.toLowerCase()));
    if (!contains) kept.push(seg);
  }
  return kept.join('').trim();
}

/**
 * Petit helper pour le code appelant : déduit le card_kind à partir d'un
 * payload MappedResponse-like (route.ts). Renvoie null si aucune card.
 */
export function inferCardKind(mapped: {
  youtube?: unknown;
  tiktok?: unknown;
  places?: unknown[] | null;
  recipe?: unknown;
  wikipedia?: unknown;
  weather?: unknown;
  products?: unknown[] | null;
  web_search?: unknown;
}): { kind: string; data: unknown } | null {
  if (mapped.youtube) return { kind: 'YouTubeCard', data: mapped.youtube };
  // Talk2Me search_tiktok (Pascal 2026-06-04) — la card TikTok est SAFE par
  // construction (passée les 5 garde-fous handler-side). Ici on l'expose au
  // validator/visualQa au même titre que les autres cards.
  if (mapped.tiktok) return { kind: 'TikTokCard', data: mapped.tiktok };
  if (Array.isArray(mapped.places) && mapped.places.length > 0)
    return { kind: 'PlaceCard', data: { places: mapped.places } };
  if (mapped.recipe) return { kind: 'RecipeCard', data: mapped.recipe };
  if (mapped.wikipedia)
    return { kind: 'WikipediaCard', data: mapped.wikipedia };
  if (mapped.weather) return { kind: 'WeatherCard', data: mapped.weather };
  if (Array.isArray(mapped.products) && mapped.products.length > 0)
    return { kind: 'ProductCard', data: mapped.products };
  if (mapped.web_search)
    return { kind: 'SearchResultCard', data: mapped.web_search };
  return null;
}

/**
 * Talk2Me #362 / P3 (Pascal 2026-06-04).
 *
 * Déduit le card_kind ATTENDU à partir de tool_used ou intent, même quand
 * le payload est vide (ex Overpass renvoie places=[] → inferCardKind retourne
 * null → la fallback_chain ne se déclenche pas, doctrine no-excuses violée).
 *
 * Mapping prioritaire :
 *  1. tool_used → expected card (search_place → PlaceCard, search_youtube →
 *     YouTubeCard, etc.). Source : consciousness.intents[*].primary_route.
 *     Mapping statique car 1-tool-N-intents (search_place couvre
 *     hotel/restaurant/cafe/bar/pharmacy).
 *  2. intent → expected card via consciousness.intents[intent].primary_route
 *     .expected_card.
 *  3. null si aucun signal.
 *
 * Renvoie aussi `tool` pour logs.
 */
const TOOL_TO_CARD: Record<string, string> = {
  search_youtube: 'YouTubeCard',
  search_tiktok: 'TikTokCard', // Talk2Me search_tiktok (Pascal 2026-06-04)
  search_place: 'PlaceCard',
  search_recipe: 'RecipeCard',
  search_wikipedia: 'WikipediaCard',
  get_weather: 'WeatherCard',
  search_product: 'ProductCard',
  search_web: 'SearchResultCard',
};

export function inferIntendedCardKind(opts: {
  tool_used?: string | null;
  intent?: string | null;
}): string | null {
  const { tool_used, intent } = opts;
  if (tool_used && TOOL_TO_CARD[tool_used]) return TOOL_TO_CARD[tool_used];
  if (intent) {
    const intents = consciousness.intents as Record<
      string,
      { primary_route?: { expected_card?: string } }
    >;
    const expected = intents[intent]?.primary_route?.expected_card;
    if (typeof expected === 'string' && expected.length > 0) return expected;
  }
  return null;
}

// =============================================================================
// LOT 4 N12 — Visual QA renforcé (Pascal master point 12, 2026-06-04)
// =============================================================================

export interface IntentToolCardOpts {
  intent: string | null;
  tool_used: string | null;
  card_kind: string | null;
}

/**
 * Règle 1 — Cohérence intent ↔ tool ↔ card.
 * Vérifie que le tool utilisé et la card générée appartiennent bien au
 * primary_route ou au fallback_chain de l'intent détecté.
 */
export function validateIntentToolCard(
  opts: IntentToolCardOpts,
): ValidateCardResultOutput {
  const { intent, tool_used, card_kind } = opts;
  if (!intent) return { ok: true };
  const intents = consciousness.intents as Record<
    string,
    {
      primary_route?: { tool?: string; expected_card?: string; kind?: string };
      fallback_chain?: Array<{
        tool?: string;
        expected_card?: string;
        kind?: string;
      }>;
    }
  >;
  const intentDef = intents[intent];
  if (!intentDef) return { ok: true };

  const expectedTool = intentDef.primary_route?.tool;
  const expectedCard = intentDef.primary_route?.expected_card;
  const fallbacks = intentDef.fallback_chain || [];

  const allowedTools = [
    expectedTool,
    ...fallbacks.map((f) => f.tool).filter(Boolean),
  ].filter((x): x is string => Boolean(x));
  // search_web et fetch_url_content sont toujours autorisés en bridge
  // (DeepSeek peut les utiliser pour combler un manque sans casser l'intent).
  const universalTools = ['search_web', 'fetch_url_content'];
  if (
    tool_used &&
    !allowedTools.includes(tool_used) &&
    !universalTools.includes(tool_used)
  ) {
    return {
      ok: false,
      reason: `Tool ${tool_used} not in route for intent ${intent}`,
      action: 'fallback',
    };
  }

  const allowedCards = [
    expectedCard,
    ...fallbacks.map((f) => f.expected_card).filter(Boolean),
    'SearchResultCard',
  ].filter((x): x is string => Boolean(x));
  if (card_kind && !allowedCards.includes(card_kind)) {
    return {
      ok: false,
      reason: `Card ${card_kind} not expected for intent ${intent}`,
      action: 'fallback',
    };
  }
  return { ok: true };
}

/**
 * Règle 2 — PlaceCard amenity strict.
 * Pour les intents géo (hotel/restaurant/cafe/bar/pharmacy), vérifie que ≥50%
 * des places retournées ont une catégorie OSM matchant l'intent.
 */
export function validatePlaceCardAmenity(opts: {
  intent: string | null;
  places: unknown[] | null | undefined;
}): ValidateCardResultOutput {
  const { intent, places } = opts;
  if (!intent) return { ok: true };
  if (!Array.isArray(places) || places.length === 0) {
    return { ok: false, reason: 'PlaceCard empty', action: 'fallback' };
  }
  const intentAmenityMap = (
    consciousness.intent_amenities as Record<string, string[]> | undefined
  ) || {};
  const expected = intentAmenityMap[intent];
  if (!expected || expected.length === 0) return { ok: true };

  const matches = places.filter((p) => {
    const a = extractAmenity(p);
    return a !== null && expected.includes(a.toLowerCase());
  });
  if (matches.length === 0) {
    return {
      ok: false,
      reason: `0 places match intent ${intent} (expected ${expected.join('|')})`,
      action: 'fallback',
    };
  }
  const minRatio =
    typeof (consciousness as Record<string, unknown>)
      .intent_amenity_min_match_ratio === 'number'
      ? ((consciousness as Record<string, unknown>)
          .intent_amenity_min_match_ratio as number)
      : 0.5;
  if (matches.length / places.length < minRatio) {
    return {
      ok: false,
      reason: `Less than ${Math.round(minRatio * 100)}% places match intent ${intent}`,
      action: 'fallback',
    };
  }
  return { ok: true };
}

/**
 * Règle 4 — Pas de prix engagé (fourchette/moyenne) sur flight/hotel.
 * Doctrine [[airbizness-no-committed-price]] transposée Talk2Me.
 * Détecte "500€", "500€-1500€", "entre 500 et 1500€", "environ 800€", etc.
 */
export function detectCommittedPrice(
  text: string,
  intent: string | null,
): boolean {
  if (!text) return false;
  const guarded = (
    (consciousness as Record<string, unknown>).committed_price_intents as
      | string[]
      | undefined
  ) || ['flight', 'hotel'];
  // Si l'intent détecté n'est pas guardé, on regarde quand même les mots-clés
  // travel dans le texte (cas "Prix moyen vol Paris New York" où detectIntent
  // résout product_shopping car "prix" matche).
  const TRAVEL_KEYWORDS =
    /\b(vol|vols|avion|hôtel|hotel|chambre|nuit\s+d['']hôtel|nuit\s+d['']hotel|billet\s+avion|booking|skyscanner)\b/i;
  if (intent && !guarded.includes(intent) && !TRAVEL_KEYWORDS.test(text)) {
    return false;
  }
  if (!intent && !TRAVEL_KEYWORDS.test(text)) {
    return false;
  }
  // Pattern 1 : un nombre suivi de €/euros (ex "500€", "1200 euros")
  const lone =
    /\b\d{2,5}\s*(?:€|euros?|eur)\b/i;
  // Pattern 2 : fourchette "entre X et Y €"
  const range =
    /\bentre\s+\d{2,5}\s+et\s+\d{2,5}\s*(?:€|euros?|eur)?/i;
  // Pattern 3 : "environ X €" / "autour de X €" / "X-Y €"
  const around =
    /\b(?:environ|autour de|aux alentours de|à peu près)\s+\d{2,5}\s*(?:€|euros?|eur)?/i;
  const dash = /\b\d{2,5}\s*[-–]\s*\d{2,5}\s*(?:€|euros?|eur)/i;
  return lone.test(text) || range.test(text) || around.test(text) || dash.test(text);
}

/**
 * Règle 5 — Mot-brut ambigu.
 * Si query ≤2 mots ET aucun mot dans les habits user → blocage + clarify.
 * Évite "Check" → search_web aveugle (bug fuzz #349).
 */
export interface MotBrutOpts {
  query: string | undefined | null;
  userHabits?: Record<string, Array<{ value?: string }>> | null;
}

export function detectAmbiguousMotBrut(
  opts: MotBrutOpts,
): ValidateCardResultOutput {
  const { query, userHabits } = opts;
  if (!query || typeof query !== 'string') return { ok: true };
  const trimmed = query.trim();
  if (!trimmed) return { ok: true };
  const maxWords =
    typeof (consciousness as Record<string, unknown>)
      .ambiguous_motbrut_max_words === 'number'
      ? ((consciousness as Record<string, unknown>)
          .ambiguous_motbrut_max_words as number)
      : 2;
  const words = trimmed.split(/\s+/);
  if (words.length > maxWords) return { ok: true };

  // Stop-words : on accepte les queries "courtes" qui sont en fait composées
  // d'une intent + entité (ex "météo Paris", "recette couscous", "qui Einstein")
  const intentMarkers = new Set([
    'météo',
    'meteo',
    'recette',
    'wiki',
    'wikipedia',
    'qui',
    'quoi',
    'comment',
    'pourquoi',
    'où',
    'ou',
    'quand',
    'vol',
    'train',
    'hôtel',
    'hotel',
    'resto',
    'restaurant',
    'cafe',
    'café',
    'bar',
    'pharmacie',
  ]);
  const hasIntentMarker = words.some((w) =>
    intentMarkers.has(w.toLowerCase().replace(/[.,;:!?]/g, '')),
  );
  if (hasIntentMarker) return { ok: true };

  // Sinon vérifier que les mots sont ancrés dans les habits user
  const habitsValues = new Set<string>();
  if (userHabits && typeof userHabits === 'object') {
    for (const list of Object.values(userHabits)) {
      if (!Array.isArray(list)) continue;
      for (const h of list) {
        if (h && typeof h === 'object' && typeof (h as { value?: unknown }).value === 'string') {
          habitsValues.add((h as { value: string }).value.toLowerCase());
        }
      }
    }
  }
  const anyInHabits = words.some((w) => {
    const lw = w.toLowerCase();
    for (const hv of habitsValues) {
      if (hv.includes(lw) || lw.includes(hv)) return true;
    }
    return false;
  });
  if (anyInHabits) return { ok: true };

  return {
    ok: false,
    reason: `Query "${trimmed}" too short and not grounded in habits`,
    action: 'clarify',
  };
}

/**
 * Talk2Me #363 — Bug B (Pascal 2026-06-05).
 *
 * Détecte une "hallucination YouTube" :
 *  - search_youtube appelé avec query vide / trop courte / générique (homepage)
 *  - result.youtube présent mais sans video_id (card pourrie)
 *  - search_web qui ramène la home youtube.com (titre "YouTube", url racine)
 *
 * Si match → action='reject' → caller doit dropper la card pour respecter
 * la doctrine no-excuses (mieux silence que card pourrie).
 */
const YOUTUBE_GENERIC_QUERIES = new Set([
  '',
  'youtube',
  'you tube',
  'video',
  'vidéo',
  'videos',
  'vidéos',
  'clip',
  'clips',
  'film',
]);

export function validateYoutubeQuery(opts: {
  tool_used: string | null;
  tool_args: Record<string, unknown> | null | undefined;
  result?: unknown;
}): ValidateCardResultOutput {
  const { tool_used, tool_args, result } = opts;
  if (tool_used !== 'search_youtube') return { ok: true };
  const rawQuery =
    tool_args && typeof tool_args.query === 'string' ? tool_args.query : '';
  const q = rawQuery.trim();
  if (q.length < 3) {
    return {
      ok: false,
      reason: 'youtube_query_too_short',
      action: 'reject',
    };
  }
  if (YOUTUBE_GENERIC_QUERIES.has(q.toLowerCase())) {
    return {
      ok: false,
      reason: 'youtube_query_generic',
      action: 'reject',
    };
  }
  // Result présent mais video_id manquant / vide → card pourrie
  if (result && typeof result === 'object') {
    const r = result as Record<string, unknown>;
    const video = (r.youtube ?? r.video) as Record<string, unknown> | null | undefined;
    if (video && typeof video === 'object') {
      const vid = (video as { video_id?: unknown }).video_id;
      if (typeof vid !== 'string' || vid.trim().length === 0) {
        return {
          ok: false,
          reason: 'youtube_no_video_id',
          action: 'reject',
        };
      }
    }
  }
  return { ok: true };
}

/**
 * Talk2Me #363 — Bug B (Pascal 2026-06-05).
 *
 * Détecte une SearchResultCard pourrie qui ramène uniquement la homepage
 * youtube.com (cas typique de search_web "youtube" ou "video" qui retombe
 * sur le meta-description "Profitez des vidéos et de la musique...").
 *
 * Règle : si TOUS les résultats web_search pointent vers le domaine racine
 * youtube.com (sans path /watch ou /channel), c'est probablement la home
 * scrape — on rejette.
 */
export function isWebSearchYoutubeHomepage(webSearch: unknown): boolean {
  if (!webSearch || typeof webSearch !== 'object') return false;
  const ws = webSearch as { results?: unknown };
  const results = ws.results;
  if (!Array.isArray(results) || results.length === 0) return false;
  return results.every((r) => {
    if (!r || typeof r !== 'object') return false;
    const url = (r as { url?: unknown }).url;
    if (typeof url !== 'string') return false;
    try {
      const u = new URL(url);
      const host = u.hostname.replace(/^www\./, '').toLowerCase();
      const isYt = host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtu.be';
      if (!isYt) return false;
      // Path racine ou trivial = homepage
      const path = u.pathname.replace(/\/+$/, '');
      return path === '' || path === '/' || path === '/feed' || path === '/feed/trending';
    } catch {
      return false;
    }
  });
}

// =============================================================================
// visualQa — orchestrateur N12 final
// =============================================================================

export interface VisualQaOpts {
  intent: string | null;
  tool_used: string | null;
  card_kind: string | null;
  card_data: unknown;
  message_text: string;
  userQuery?: string;
  userHabits?: Record<string, Array<{ value?: string }>> | null;
  tool_args?: Record<string, unknown> | null;
}

export interface VisualQaResult extends ValidateCardResultOutput {
  /** Texte de remplacement (clarify) si action=clarify */
  clarificationQuestion?: string;
  /** Texte de remplacement si committed_price détecté (action=reject) */
  redirectText?: string;
}

/**
 * Orchestrateur Visual QA — combine toutes les règles N12.
 * Pascal verbatim master point 12 :
 *  "Ai-je utilisé le bon outil ? la bonne Card ? le résultat répond-il à la
 *   demande ? erreur visible ? tool_call visible ? JSON visible ? URL brute
 *   visible ? Si NON → correction automatique."
 */
export function visualQa(opts: VisualQaOpts): VisualQaResult {
  // Talk2Me #363 Bug B (Pascal 2026-06-05) : validation query YouTube AVANT
  // tout. Si DeepSeek a tapé search_youtube avec une query générique/vide ou
  // si le payload manque video_id, on rejette pour ne pas exposer la home YT.
  const ytq = validateYoutubeQuery({
    tool_used: opts.tool_used,
    tool_args: opts.tool_args,
    result: opts.card_data ? { youtube: opts.card_data } : undefined,
  });
  if (!ytq.ok) {
    return { ok: false, reason: ytq.reason, action: 'reject' };
  }

  // Talk2Me #363 Bug B : SearchResultCard ramenant uniquement la homepage
  // youtube.com → rejet (cas search_web sur query "youtube"/"video").
  if (opts.card_kind === 'SearchResultCard' && isWebSearchYoutubeHomepage(opts.card_data)) {
    return {
      ok: false,
      reason: 'web_search_youtube_homepage',
      action: 'reject',
    };
  }

  // Règle 1 : intent ↔ tool ↔ card
  const r1 = validateIntentToolCard({
    intent: opts.intent,
    tool_used: opts.tool_used,
    card_kind: opts.card_kind,
  });
  if (!r1.ok) return r1;

  // Règle 2 : PlaceCard amenity (si PlaceCard)
  if (opts.card_kind === 'PlaceCard') {
    const places = placesArray(opts.card_data);
    const r2 = validatePlaceCardAmenity({
      intent: opts.intent,
      places,
    });
    if (!r2.ok) return r2;
  }

  // Règle 3 : pipeline-leak appliqué séparément via scrubForbiddenPhrases

  // Règle 4 : prix engagé sur flight/hotel
  if (detectCommittedPrice(opts.message_text, opts.intent)) {
    const redirect =
      (typeof (consciousness as Record<string, unknown>).no_price_redirect_text ===
      'string'
        ? ((consciousness as Record<string, unknown>).no_price_redirect_text as string)
        : '') ||
      'Pour les prix live, regarde directement sur Booking ou Skyscanner.';
    return {
      ok: false,
      reason: 'committed_price',
      action: 'reject',
      redirectText: redirect,
    };
  }

  // Règle 5 : mot-brut ambigu — uniquement si l'intent est null OU general_web.
  // Si l'intent est clairement détecté (youtube_video, recipe, hotel, etc.),
  // la query courte est légitime (ex "Daft Punk" sur intent youtube_video,
  // "couscous" sur intent recipe). On ne bloque QUE les cas où l'IA tape
  // dans le vide sur un mot brut sans contexte.
  const ambiguousIntents = new Set([null, undefined, 'general_web']);
  if (
    ambiguousIntents.has(opts.intent as null | undefined | string) &&
    opts.tool_args &&
    typeof opts.tool_args === 'object'
  ) {
    const query =
      typeof opts.tool_args.query === 'string'
        ? (opts.tool_args.query as string)
        : typeof opts.tool_args.topic === 'string'
          ? (opts.tool_args.topic as string)
          : '';
    if (query) {
      const r5 = detectAmbiguousMotBrut({
        query,
        userHabits: opts.userHabits || null,
      });
      if (!r5.ok) {
        const clarify =
          (typeof (consciousness as Record<string, unknown>)
            .ambiguous_motbrut_clarify_text === 'string'
            ? ((consciousness as Record<string, unknown>)
                .ambiguous_motbrut_clarify_text as string)
            : '') ||
          'Tu peux préciser ce que tu cherches ?';
        return {
          ...r5,
          clarificationQuestion: clarify,
        };
      }
    }
  }

  return { ok: true };
}
