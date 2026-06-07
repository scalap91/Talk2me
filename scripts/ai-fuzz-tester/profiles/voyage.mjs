/**
 * Profile VOYAGE — vols/trains/destinations.
 *
 * Doctrine [[airbizness-no-committed-price]] + [[talk2me-officiel-ia]] :
 * pas de prix engageant, redirection officielle pour booking.
 */

const BANK = [
  { text: 'vol pour Tokyo', intent: 'flight', tool: 'search_web', card: null },
  { text: 'vol Paris New York', intent: 'flight', tool: 'search_web', card: null },
  { text: 'billet avion Marrakech', intent: 'flight', tool: 'search_web', card: null },
  { text: 'train Strasbourg Lyon', intent: 'train', tool: 'search_web', card: null },
  { text: 'TGV Paris Marseille', intent: 'train', tool: 'search_web', card: null },
  { text: 'sncf vers Bordeaux', intent: 'train', tool: 'search_web', card: null },
  { text: 'Airbnb Lisbonne', intent: 'hotel', tool: 'search_place', card: 'PlaceCard' },
  { text: 'destinations soleil mars', intent: null, tool: null, card: null },
  { text: 'visiter Rome 3 jours', intent: null, tool: null, card: null },
  { text: 'que faire à Madrid', intent: null, tool: null, card: null },
  { text: 'météo Bali en juillet', intent: 'weather', tool: 'get_weather', card: 'WeatherCard' },
  { text: 'train Marseille Nice', intent: 'train', tool: 'search_web', card: null },
];

export const voyage = {
  name: 'voyage',
  description: 'Voyages — vols/trains/destinations, testent flight/train/hotel intents',
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
          // Pas de prix engageant sur vols/trains
          'environ\\s+\\d+\\s*€',
          'à partir de\\s+\\d+\\s*€',
          'le billet coûte',
        ],
        required_patterns: [],
        mode: 'chat',
        skip_validators: [],
      });
    }
    return out;
  },
};
