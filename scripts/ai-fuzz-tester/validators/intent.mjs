/**
 * Validator INTENT — compare l'intent attendu vs l'intent que le serveur a
 * détecté (passé en réponse API si exposé, sinon inféré à partir des cards
 * effectivement produites).
 *
 * Pour pouvoir signaler les écarts router sans modifier l'API publique, on
 * vérifie d'abord via les cards/tools matérialisés.
 */

const CARD_TO_INTENT = {
  PlaceCard: ['hotel', 'restaurant', 'cafe', 'bar', 'pharmacy'],
  YouTubeCard: ['youtube_video'],
  TikTokCard: ['tiktok_video'],
  RecipeCard: ['recipe'],
  WikipediaCard: ['wikipedia'],
  WeatherCard: ['weather'],
  ProductCard: ['product_shopping'],
  SearchResultCard: ['flight', 'train', 'general_web'],
};

function inferIntentFromResponse(resp) {
  if (resp.youtube) return 'youtube_video';
  if (Array.isArray(resp.places) && resp.places.length > 0) {
    // L'amenity de la première place donne l'intent
    const a = (resp.places[0].amenity || '').toLowerCase();
    if (a.includes('hotel')) return 'hotel';
    if (a.includes('restaurant') || a.includes('food')) return 'restaurant';
    if (a.includes('cafe')) return 'cafe';
    if (a.includes('bar') || a.includes('pub')) return 'bar';
    if (a.includes('pharmacy')) return 'pharmacy';
    return 'place';
  }
  if (resp.recipe) return 'recipe';
  if (resp.wikipedia) return 'wikipedia';
  if (resp.weather) return 'weather';
  if (Array.isArray(resp.products) && resp.products.length > 0) return 'product_shopping';
  if (resp.tiktok) return 'tiktok_video';
  if (resp.web_search) return 'general_web';
  return null;
}

export function validateIntent(prompt, response) {
  if (!prompt.expected_intent) {
    // Aucun intent attendu — toujours pass (validator skip)
    return { name: 'intent', pass: true, reason: 'no expected intent' };
  }
  const detected = inferIntentFromResponse(response);
  if (!detected) {
    // Pas d'intent détectable : on regarde si la réponse texte est non vide
    // (cas conversationnel sans card) — heuristique : si une card était
    // attendue (placecard etc) et rien produit → FAIL.
    if (prompt.expected_card_kind) {
      return {
        name: 'intent',
        pass: false,
        reason: `intent "${prompt.expected_intent}" attendu mais aucun tool/card matérialisé`,
      };
    }
    return { name: 'intent', pass: true, reason: 'no card expected, text-only ok' };
  }
  // Tolérance : intent strict si famille match
  const expectedCardIntents = CARD_TO_INTENT[prompt.expected_card_kind] || [];
  if (detected === prompt.expected_intent) {
    return { name: 'intent', pass: true, reason: `match ${detected}` };
  }
  // Tolère si le détecté est dans la même famille de cards
  if (
    prompt.expected_card_kind &&
    CARD_TO_INTENT[prompt.expected_card_kind]?.includes(detected)
  ) {
    return {
      name: 'intent',
      pass: true,
      reason: `match famille card ${prompt.expected_card_kind} (detected=${detected})`,
    };
  }
  return {
    name: 'intent',
    pass: false,
    reason: `intent attendu="${prompt.expected_intent}" détecté="${detected}"`,
  };
}
