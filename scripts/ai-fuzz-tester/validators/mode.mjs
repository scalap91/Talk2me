/**
 * Validator MODE — vérifie que le bon mode contextuel (N8/N9 consciousness)
 * est respecté.
 *
 * Si le prompt force mode=card_editor_video, les tools de recherche (search_*)
 * doivent être bloqués. Le validator regarde si une card "incompatible" a été
 * produite (signe que le mode-gate a fui).
 */

const MODE_FROZEN_CARDS = {
  card_editor_video: ['YouTubeCard', 'TikTokCard', 'PlaceCard', 'RecipeCard', 'WikipediaCard', 'WeatherCard', 'ProductCard', 'SearchResultCard'],
  card_editor_image: ['YouTubeCard', 'TikTokCard', 'PlaceCard', 'RecipeCard', 'WikipediaCard', 'WeatherCard', 'ProductCard', 'SearchResultCard'],
  card_editor_text: ['YouTubeCard', 'TikTokCard', 'PlaceCard', 'RecipeCard', 'WikipediaCard', 'WeatherCard', 'ProductCard', 'SearchResultCard'],
  watch_together: ['YouTubeCard', 'TikTokCard', 'PlaceCard', 'RecipeCard', 'WikipediaCard', 'WeatherCard', 'ProductCard', 'SearchResultCard'],
};

function detectProducedCardKind(resp) {
  if (resp.youtube) return 'YouTubeCard';
  if (resp.tiktok) return 'TikTokCard';
  if (Array.isArray(resp.places) && resp.places.length > 0) return 'PlaceCard';
  if (resp.recipe) return 'RecipeCard';
  if (resp.wikipedia) return 'WikipediaCard';
  if (resp.weather) return 'WeatherCard';
  if (Array.isArray(resp.products) && resp.products.length > 0) return 'ProductCard';
  if (resp.web_search) return 'SearchResultCard';
  return null;
}

export function validateMode(prompt, response) {
  const mode = prompt.mode || 'chat';
  if (mode === 'chat') {
    return { name: 'mode', pass: true, reason: 'mode chat, all allowed' };
  }
  const frozen = MODE_FROZEN_CARDS[mode] || [];
  const produced = detectProducedCardKind(response);
  if (!produced) {
    return { name: 'mode', pass: true, reason: `mode ${mode}, no card produced` };
  }
  if (frozen.includes(produced)) {
    return {
      name: 'mode',
      pass: false,
      reason: `mode ${mode} a produit ${produced} alors que ce kind est gelé`,
    };
  }
  return { name: 'mode', pass: true, reason: 'ok' };
}
