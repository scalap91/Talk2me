/**
 * Profile FAUTES — user qui écrit avec des fautes d'orthographe.
 *
 * Doctrine [[talktome-raisonnement-ia]] : Léa raisonne sur la phrase complète,
 * pas mot par mot — doit reconnaître l'intent malgré les fautes.
 */

const BANK = [
  { text: 'trouv mwa 1 restau a paris', intent: 'restaurant', tool: 'search_place', card: 'PlaceCard' },
  { text: 'jvoudré 1 hotel sur lion', intent: 'hotel', tool: 'search_place', card: 'PlaceCard' },
  { text: 'recete de couscous svp', intent: 'recipe', tool: 'search_recipe', card: 'RecipeCard' },
  { text: 'meteau a marseil', intent: 'weather', tool: 'get_weather', card: 'WeatherCard' },
  { text: 'pharmasi de garde bordo', intent: 'pharmacy', tool: 'search_place', card: 'PlaceCard' },
  { text: 'kfé a montpelier', intent: 'cafe', tool: 'search_place', card: 'PlaceCard' },
  { text: 'jveux 1 video sur les chiens', intent: 'youtube_video', tool: 'search_youtube', card: 'YouTubeCard' },
  { text: 'bare a vin sur nise', intent: 'bar', tool: 'search_place', card: 'PlaceCard' },
  { text: 'restaurent italyen rene', intent: 'restaurant', tool: 'search_place', card: 'PlaceCard' },
  { text: 'recette tjine maroc', intent: 'recipe', tool: 'search_recipe', card: 'RecipeCard' },
  { text: 'meteau demain tulouse', intent: 'weather', tool: 'get_weather', card: 'WeatherCard' },
  { text: 'wikipedia napoléon bonapard', intent: 'wikipedia', tool: 'search_wikipedia', card: 'WikipediaCard' },
  { text: 'hotelle a bordo pas chére', intent: 'hotel', tool: 'search_place', card: 'PlaceCard' },
];

export const fautes = {
  name: 'fautes',
  description: 'User avec fautes : othographe approximative, accents partiels',
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
          'je n\'ai pas compris',
          'pouvez-vous reformuler',
          // Doctrine no-excuses : pas d'excuse même sur fautes
          'désolé',
        ],
        required_patterns: [],
        mode: 'chat',
        skip_validators: [],
      });
    }
    return out;
  },
};
