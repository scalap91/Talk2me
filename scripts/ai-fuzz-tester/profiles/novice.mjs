/**
 * Profile NOVICE — user qui découvre Talk2Me, pose des questions naïves.
 *
 * Doctrine [[talktome-no-excuses]] : Léa ne doit pas réciter ses limites.
 * Doctrine [[talktome-conversation-avant-recherche]] : pour les questions
 * conversationnelles ("comment ça marche ?"), réponse texte courte, pas card.
 */

const BANK = [
  { text: 'comment ça marche ?', intent: null, tool: null, card: null },
  { text: "j'ai pas compris ce que tu fais", intent: null, tool: null, card: null },
  { text: 'tu sers à quoi ?', intent: null, tool: null, card: null },
  { text: "c'est quoi Talk2Me ?", intent: null, tool: null, card: null },
  { text: 'tu peux faire quoi ?', intent: null, tool: null, card: null },
  { text: 'comment je te parle ?', intent: null, tool: null, card: null },
  { text: 'tu connais qui ?', intent: null, tool: null, card: null },
  { text: 'qui es-tu ?', intent: null, tool: null, card: null },
  { text: 'comment tu fais pour répondre ?', intent: null, tool: null, card: null },
  { text: 'tu es une IA ?', intent: null, tool: null, card: null },
  { text: 'tu connais Google ?', intent: null, tool: null, card: null },
  { text: "j'ai besoin d'aide", intent: null, tool: null, card: null },
  { text: 'aide moi', intent: null, tool: null, card: null },
  { text: 'je sais pas quoi faire', intent: null, tool: null, card: null },
  { text: 'tu es là ?', intent: null, tool: null, card: null },
  { text: 'salut', intent: null, tool: null, card: null },
  { text: 'bonjour', intent: null, tool: null, card: null },
  { text: 'ok', intent: null, tool: null, card: null },
  { text: 'merci', intent: null, tool: null, card: null },
  { text: 'tu peux m\'expliquer ?', intent: null, tool: null, card: null },
];

export const novice = {
  name: 'novice',
  description: 'User débutant, questions floues / méta sur le produit',
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
          // Doctrine [[talktome-no-excuses]]
          'je n\\u2019ai pas trouv',
          'je n\'ai pas',
          'désolé je ne peux pas',
          // Pas de markdown brut
          '\\*\\*[A-Za-z]',
          '^#{1,6} ',
          // Pas d'identité usurpée
          'je m\'appelle Talk2Me',
          'je suis Talk2Me',
        ],
        required_patterns: [],
        mode: 'chat',
        skip_validators: [],
      });
    }
    return out;
  },
};
