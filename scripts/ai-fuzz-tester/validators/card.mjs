/**
 * Validator CARD — vérifie qu'une card du bon kind a été produite.
 */

function inferCardKind(resp) {
  if (resp.youtube && resp.youtube.video_id) return 'YouTubeCard';
  if (resp.tiktok) return 'TikTokCard';
  if (Array.isArray(resp.places) && resp.places.length > 0) return 'PlaceCard';
  if (resp.recipe) return 'RecipeCard';
  if (resp.wikipedia) return 'WikipediaCard';
  if (resp.weather) return 'WeatherCard';
  if (Array.isArray(resp.products) && resp.products.length > 0) return 'ProductCard';
  if (resp.web_search && Array.isArray(resp.web_search.results) && resp.web_search.results.length > 0) {
    return 'SearchResultCard';
  }
  return null;
}

export function validateCard(prompt, response) {
  if (!prompt.expected_card_kind) {
    return { name: 'card', pass: true, reason: 'no card expected' };
  }
  const detected = inferCardKind(response);
  if (detected === prompt.expected_card_kind) {
    return { name: 'card', pass: true, reason: `match ${detected}` };
  }
  // SearchResultCard acceptable comme fallback générique pour flight/train
  if (detected === 'SearchResultCard' && prompt.expected_intent && (prompt.expected_intent === 'flight' || prompt.expected_intent === 'train')) {
    return { name: 'card', pass: true, reason: 'SearchResultCard fallback flight/train OK' };
  }
  return {
    name: 'card',
    pass: false,
    reason: `card attendue="${prompt.expected_card_kind}" produite="${detected || 'aucune'}"`,
  };
}
