/**
 * Validator TOOL — vérifie que le bon tool a été appelé.
 *
 * L'API /api/chat ne retourne pas explicitement les noms de tools appelés
 * (sauf via les logs PM2). On infère du tool à partir des cards produites
 * (mapping inverse).
 */

const CARD_TO_TOOL = {
  PlaceCard: 'search_place',
  YouTubeCard: 'search_youtube',
  TikTokCard: 'search_tiktok',
  RecipeCard: 'search_recipe',
  WikipediaCard: 'search_wikipedia',
  WeatherCard: 'get_weather',
  ProductCard: 'search_product',
  SearchResultCard: 'search_web',
};

function inferToolFromResponse(resp) {
  if (resp.youtube) return 'search_youtube';
  if (resp.tiktok) return 'search_tiktok';
  if (Array.isArray(resp.places) && resp.places.length > 0) return 'search_place';
  if (resp.placeSearch) return 'search_place';
  if (resp.recipe) return 'search_recipe';
  if (resp.wikipedia) return 'search_wikipedia';
  if (resp.weather) return 'get_weather';
  if (Array.isArray(resp.products) && resp.products.length > 0) return 'search_product';
  if (resp.web_search) return 'search_web';
  return null;
}

export function validateTool(prompt, response) {
  if (!prompt.expected_tool) {
    return { name: 'tool', pass: true, reason: 'no expected tool' };
  }
  const detected = inferToolFromResponse(response);
  if (!detected) {
    if (prompt.expected_card_kind) {
      return {
        name: 'tool',
        pass: false,
        reason: `tool "${prompt.expected_tool}" attendu mais aucun appel détectable`,
      };
    }
    return { name: 'tool', pass: true, reason: 'pas de tool attendu, conversationnel ok' };
  }
  if (detected === prompt.expected_tool) {
    return { name: 'tool', pass: true, reason: `match ${detected}` };
  }
  // Tolère search_web comme fallback générique (sauf si intent strict
  // resto/hotel — c'est précisément le bug à attraper)
  if (
    detected === 'search_web' &&
    (prompt.expected_tool === 'search_place' ||
      prompt.expected_tool === 'search_youtube')
  ) {
    return {
      name: 'tool',
      pass: false,
      reason: `fallback search_web alors que ${prompt.expected_tool} attendu`,
    };
  }
  return {
    name: 'tool',
    pass: false,
    reason: `tool attendu="${prompt.expected_tool}" détecté="${detected}"`,
  };
}
