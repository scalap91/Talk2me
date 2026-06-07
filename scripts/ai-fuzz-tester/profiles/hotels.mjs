/**
 * Profile HOTELS — focus search hôtel (intent hotel, primary route search_place
 * amenity=hotel). Bug PROD #340 : DeepSeek tombait sur amenity=restaurant en
 * fallback. Le validator router doit bloquer.
 *
 * Doctrine [[airbizness-no-committed-price]] : Léa NE DOIT JAMAIS donner de
 * prix engageant (fourchette/moyenne). Pour les prix → redirige Booking.
 */

const BANK = [
  { text: 'hôtel 4 étoiles à Bali en septembre', intent: 'hotel', tool: 'search_place', card: 'PlaceCard' },
  { text: 'palace Marrakech', intent: 'hotel', tool: 'search_place', card: 'PlaceCard' },
  { text: 'trouve-moi un hôtel à Paris pour 2 nuits', intent: 'hotel', tool: 'search_place', card: 'PlaceCard' },
  { text: 'hotel pas cher Lille', intent: 'hotel', tool: 'search_place', card: 'PlaceCard' },
  { text: 'auberge sur Annecy', intent: 'hotel', tool: 'search_place', card: 'PlaceCard' },
  { text: 'hôtel romantique Venise', intent: 'hotel', tool: 'search_place', card: 'PlaceCard' },
  { text: 'logement à Lisbonne', intent: 'hotel', tool: 'search_place', card: 'PlaceCard' },
  { text: 'chambre d\'hôtel Bordeaux', intent: 'hotel', tool: 'search_place', card: 'PlaceCard' },
  { text: 'nuit d\'hôtel Lyon', intent: 'hotel', tool: 'search_place', card: 'PlaceCard' },
  { text: 'hotel famille Disneyland', intent: 'hotel', tool: 'search_place', card: 'PlaceCard' },
  { text: 'hôtel Évry', intent: 'hotel', tool: 'search_place', card: 'PlaceCard' },
  { text: 'réserver une chambre Strasbourg', intent: 'hotel', tool: 'search_place', card: 'PlaceCard' },
];

export const hotels = {
  name: 'hotels',
  description: 'Recherches hôtelières — testent intent hotel + amenity strict',
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
          // Doctrine [[airbizness-no-committed-price]]
          '\\d+\\s*€\\s*[/à-]\\s*nuit',
          'environ\\s+\\d+\\s*€',
          'à partir de\\s+\\d+\\s*€',
          'entre\\s+\\d+\\s+et\\s+\\d+\\s*€',
          // Cards primauté : pas de fallback resto sur intent hotel
        ],
        required_patterns: [],
        mode: 'chat',
        skip_validators: [],
      });
    }
    return out;
  },
};
