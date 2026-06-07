/**
 * Profile ABRÉGÉ — user SMS-style ultra-court (abréviations, lettres seules).
 *
 * Cas extrême : "rstr ital pari 19h" → restaurant italien Paris 19h.
 * Doctrine [[talktome-raisonnement-ia]] : query enrichie obligatoire.
 */

const BANK = [
  { text: 'rstr ital pari', intent: 'restaurant', tool: 'search_place', card: 'PlaceCard' },
  { text: 'htl mrkch', intent: 'hotel', tool: 'search_place', card: 'PlaceCard' },
  { text: 'mtr lyn', intent: 'weather', tool: 'get_weather', card: 'WeatherCard' },
  { text: 'phrm bdx', intent: 'pharmacy', tool: 'search_place', card: 'PlaceCard' },
  { text: 'rstr jap nyc', intent: 'restaurant', tool: 'search_place', card: 'PlaceCard' },
  { text: 'vid daft punk', intent: 'youtube_video', tool: 'search_youtube', card: 'YouTubeCard' },
  { text: 'cf marseille', intent: 'cafe', tool: 'search_place', card: 'PlaceCard' },
  { text: 'br nantes', intent: 'bar', tool: 'search_place', card: 'PlaceCard' },
  { text: 'rcette tjine', intent: 'recipe', tool: 'search_recipe', card: 'RecipeCard' },
  { text: 'mtr paris dem', intent: 'weather', tool: 'get_weather', card: 'WeatherCard' },
  { text: 'htl niz', intent: 'hotel', tool: 'search_place', card: 'PlaceCard' },
  { text: 'vid musc francaise', intent: 'youtube_video', tool: 'search_youtube', card: 'YouTubeCard' },
];

export const abrege = {
  name: 'abrege',
  description: 'User SMS-style : abréviations, lettres seules, aucun mot complet',
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
          'je ne comprends pas',
          'sois plus précis',
          'reformule',
        ],
        required_patterns: [],
        mode: 'chat',
        skip_validators: [],
      });
    }
    return out;
  },
};
