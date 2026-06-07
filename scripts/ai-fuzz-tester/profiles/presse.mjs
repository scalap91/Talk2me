/**
 * Profile PRESSÉ — user pressé qui écrit court, en majuscules, sans politesse.
 *
 * Doctrine [[talktome-raisonnement-ia]] : malgré le style sec, Léa doit
 * identifier l'intent et appeler le bon tool, jamais "j'ai trouvé plusieurs".
 */

const BANK = [
  { text: 'vite resto Paris', intent: 'restaurant', tool: 'search_place', card: 'PlaceCard' },
  { text: 'URGENT hotel Lyon', intent: 'hotel', tool: 'search_place', card: 'PlaceCard' },
  { text: 'meteo Marseille MAINTENANT', intent: 'weather', tool: 'get_weather', card: 'WeatherCard' },
  { text: 'cafe Bordeaux maintenant', intent: 'cafe', tool: 'search_place', card: 'PlaceCard' },
  { text: 'PHARMACIE Nice', intent: 'pharmacy', tool: 'search_place', card: 'PlaceCard' },
  { text: 'BAR Lille vite', intent: 'bar', tool: 'search_place', card: 'PlaceCard' },
  { text: 'vol Tokyo URGENT', intent: 'flight', tool: 'search_web', card: null },
  { text: 'train TGV Strasbourg', intent: 'train', tool: 'search_web', card: null },
  { text: 'video Daft Punk', intent: 'youtube_video', tool: 'search_youtube', card: 'YouTubeCard' },
  { text: 'recette omelette VITE', intent: 'recipe', tool: 'search_recipe', card: 'RecipeCard' },
  { text: 'meteo Toulouse', intent: 'weather', tool: 'get_weather', card: 'WeatherCard' },
  { text: 'HOTEL Nantes 2 nuits', intent: 'hotel', tool: 'search_place', card: 'PlaceCard' },
  { text: 'resto japonais Rennes', intent: 'restaurant', tool: 'search_place', card: 'PlaceCard' },
  { text: 'pharmacie 24h Paris', intent: 'pharmacy', tool: 'search_place', card: 'PlaceCard' },
  { text: 'video humour', intent: 'youtube_video', tool: 'search_youtube', card: 'YouTubeCard' },
];

export const presse = {
  name: 'presse',
  description: 'User pressé : court, MAJUSCULES, mots-clés bruts',
  generate(count) {
    const out = [];
    for (let i = 0; i < count; i++) {
      const t = BANK[i % BANK.length];
      out.push({
        text: t.text,
        expected_intent: t.intent,
        expected_tool: t.tool,
        expected_card_kind: t.card,
        forbidden_patterns: [
          'je cherche pour toi',
          'laisse-moi chercher',
          'j\'ai trouvé plusieurs',
          'un instant',
        ],
        required_patterns: [],
        mode: 'chat',
        skip_validators: [],
      });
    }
    return out;
  },
};
