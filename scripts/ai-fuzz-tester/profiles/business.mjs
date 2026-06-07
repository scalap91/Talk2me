/**
 * Profile BUSINESS — workflows pro (RDV, devis, contact).
 *
 * Talk2Me n'a pas (encore) ces tools — Léa devrait répondre conversationnel
 * SANS appeler de tool inadéquat. Test du mode-gate + des limits (N10).
 */

const BANK = [
  { text: 'rendez-vous à 14h demain', intent: null, tool: null, card: null },
  { text: 'envoie devis à Karim', intent: null, tool: null, card: null },
  { text: 'planifie un meeting jeudi', intent: null, tool: null, card: null },
  { text: 'rappelle-moi la réunion', intent: null, tool: null, card: null },
  { text: 'note : rappeler le client', intent: null, tool: null, card: null },
  { text: 'résume cette conversation', intent: null, tool: null, card: null },
  { text: 'rédige un mail pro', intent: null, tool: null, card: null },
  { text: 'crée une présentation 10 slides', intent: null, tool: null, card: null },
  { text: 'envoie facture à Pascal', intent: null, tool: null, card: null },
  { text: 'agenda de la semaine', intent: null, tool: null, card: null },
  { text: 'crée un événement Calendar', intent: null, tool: null, card: null },
  { text: 'envoie SMS à mon associé', intent: null, tool: null, card: null },
];

export const business = {
  name: 'business',
  description: 'Workflows pro non-implémentés — testent les limits N10',
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
          // L'IA ne doit pas prétendre exécuter une action qu'elle ne peut pas
          'c\'est fait',
          'envoyé !',
          'envoyée !',
          'rendez-vous créé',
          'meeting planifié',
          'mail envoyé',
        ],
        required_patterns: [],
        mode: 'chat',
        skip_validators: [],
      });
    }
    return out;
  },
};
