/**
 * Talk2Me #414 — Prompt builder contextuel (Pascal 2026-06-05).
 *
 * Construit le system prompt Léa DYNAMIQUEMENT par message, au lieu d'un
 * prompt fixe géant. Avantages :
 *  - Plus court → moins de tokens gaspillés
 *  - Plus précis → l'IA voit la règle qui CORRESPOND à son message
 *  - Plus contrôlable → on peut renforcer une consigne juste quand utile
 *
 * Architecture :
 *   buildLeaSystemPrompt({ userMessage, ... })
 *     → BASE_LEA_PROMPT
 *     + analyzeUserMessage(userMessage) → injection conditionnelle
 *
 * Doctrine [[feedback-modular-no-scattered-patches]] : 1 module, branché
 * dans /api/chat (solo) ET /api/conversations/[id]/messages (P2P).
 *
 * Compatibilité : ce builder produit un BLOC à AJOUTER au prompt existant,
 * pas un remplacement. On le concatène en queue avant l'appel DeepSeek. Ça
 * évite de tout réécrire et garde les autres blocs (consciousness, habits,
 * memories) intacts.
 */

import { detectIntent } from './router';

// === Heuristique d'analyse du message user ===

export interface UserMessageAnalysis {
  is_meta_question: boolean;     // "comment tu marches ?", "tu sers à quoi ?"
  is_identity_question: boolean; // "qui es-tu ?", "tu es une IA ?"
  is_search_intent: boolean;     // "trouve-moi un resto", "cherche..."
  intent_category: string | null;// 'restaurant' | 'hotel' | 'music' | 'voyage' | etc.
  requires_grounding: boolean;   // demande de faits chiffrés / résultats concrets
}

const META_KEYWORDS = [
  'comment ça marche',
  'comment tu marches',
  'comment tu fonctionnes',
  'comment tu fais',
  'à quoi tu sers',
  'tu sers à quoi',
  'tu peux faire quoi',
  'qu\'est-ce que tu fais',
  'qu\'est ce que tu fais',
  'comment je te parle',
  'tu connais qui',
  'tu connais quoi',
  'c\'est quoi talk2me',
  'qu\'est-ce que talk2me',
  'explique-moi',
  'tu m\'expliques',
  'tu peux m\'expliquer',
  'j\'ai pas compris',
];

const IDENTITY_KEYWORDS = [
  'qui es-tu',
  'qui es tu',
  'qui tu es',
  'tu es une ia',
  'tu es qui',
  'comment tu t\'appelles',
  'ton nom',
  'tu t\'appelles comment',
  'quel est ton nom',
];

const SEARCH_INTENT_KEYWORDS = [
  'trouve',
  'trouve-moi',
  'trouve moi',
  'cherche',
  'cherche-moi',
  'cherche moi',
  'donne-moi',
  'donne moi',
  'montre-moi',
  'montre moi',
  'propose-moi',
  'propose moi',
  'suggère',
  'recommande',
  'recommandé',
  'recommandes',
];

// Mapping rapide intent_category → tool prioritaire à suggérer dans le prompt.
// Source de vérité : consciousness.json (intents.*.primary_route).
// Ici on duplique uniquement le subset SEARCH (pour le builder), pas un fork.
const INTENT_CATEGORY_KEYWORDS: Record<string, string[]> = {
  restaurant: ['resto', 'restaurant', 'restau', 'déjeuner', 'dejeuner', 'dîner', 'diner', 'manger', 'bouffe', 'brunch', 'cuisine japonaise', 'cuisine italienne', 'trattoria', 'bistrot'],
  hotel:      ['hôtel', 'hotel', 'auberge', 'dormir', 'palace', 'logement', 'chambre d\'hôtel', 'nuit d\'hôtel', 'gîte', 'gite'],
  cafe:       ['café', 'coffee', 'coffee shop', 'starbucks'],
  bar:        ['bar', 'pub', 'boire un verre'],
  pharmacy:   ['pharmacie', 'pharmacien', 'médicament'],
  music:      ['musique', 'chanson', 'morceau', 'écouter', 'écoutes', 'son', 'audio', 'mets-moi', 'playlist', 'mets moi'],
  video:      ['vidéo', 'video', 'clip', 'docu', 'documentaire', 'film'],
  recipe:     ['recette', 'cuisiner', 'préparer', 'ingrédients'],
  weather:    ['météo', 'meteo', 'temps qu\'il fait', 'température', 'il pleut', 'il fait beau'],
  voyage:     ['vol', 'avion', 'train', 'sncf', 'tgv', 'voyage', 'séjour', 'destination'],
  shopping:   ['acheter', 'produit', 'shopping', 'robe', 'casque', 'commande'],
};

const GROUNDING_KEYWORDS = [
  'prix',
  'tarif',
  'horaire',
  'adresse',
  'téléphone',
  'tel',
  'numéro',
  'chiffres',
  'statistiques',
  'résultats',
  'classement',
];

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

function containsAny(haystack: string, needles: string[]): boolean {
  for (const n of needles) {
    if (haystack.includes(normalize(n))) return true;
  }
  return false;
}

export function analyzeUserMessage(message: string): UserMessageAnalysis {
  const empty: UserMessageAnalysis = {
    is_meta_question: false,
    is_identity_question: false,
    is_search_intent: false,
    intent_category: null,
    requires_grounding: false,
  };
  if (!message || typeof message !== 'string') return empty;
  const lower = normalize(message);

  const is_meta_question = containsAny(lower, META_KEYWORDS);
  const is_identity_question = containsAny(lower, IDENTITY_KEYWORDS);
  const is_search_intent = containsAny(lower, SEARCH_INTENT_KEYWORDS);

  // Catégorie intent — premier match remporte (le plus pertinent)
  let intent_category: string | null = null;
  // Aussi tester via le détecteur d'intent canonique (consciousness.json)
  const detected = detectIntent(message);
  if (detected) {
    // Remap les intents canoniques vers nos catégories locales si besoin
    const map: Record<string, string> = {
      hotel: 'hotel',
      restaurant: 'restaurant',
      cafe: 'cafe',
      bar: 'bar',
      pharmacy: 'pharmacy',
      youtube_video: 'video',
      recipe: 'recipe',
      weather: 'weather',
      flight: 'voyage',
      train: 'voyage',
      product_shopping: 'shopping',
    };
    intent_category = map[detected.intent] || null;
  }
  if (!intent_category) {
    for (const [cat, kws] of Object.entries(INTENT_CATEGORY_KEYWORDS)) {
      if (containsAny(lower, kws)) {
        intent_category = cat;
        break;
      }
    }
  }

  const requires_grounding = containsAny(lower, GROUNDING_KEYWORDS);

  return {
    is_meta_question,
    is_identity_question,
    is_search_intent,
    intent_category,
    requires_grounding,
  };
}

// === Builder ===

export interface BuildPromptCtx {
  /** Message courant de l'user (post-PII scrub déjà fait par l'appelant si besoin). */
  userMessage: string;
  /** Nom de l'IA (pour la règle identité — Léa parle d'ELLE, pas de l'user). */
  aiName: string;
}

/**
 * Construit un BLOC additionnel à concaténer au system prompt existant.
 * Ne retourne rien si l'analyse ne déclenche aucune règle pertinente
 * (économise les tokens).
 *
 * Bug Pascal #414 fix :
 *  1. Question méta → régime strict conversationnel (pas markdown, court)
 *  2. Question identité → INTERDICTION mention nom user
 *  3. Search intent → INTERDICTION annonces + suggestion tool
 *  4. Grounding requis → NE PAS inventer si tool result vide
 */
export function buildLeaSystemPromptAddon(ctx: BuildPromptCtx): string {
  if (!ctx.userMessage) return '';
  const analysis = analyzeUserMessage(ctx.userMessage);
  const sections: string[] = [];

  // RÈGLE GLOBALE pour TOUTE réponse (toujours injectée — c'est le bug #1
  // markdown leak qui justifie ça : mesuré 5/10 fails sur novice).
  sections.push(
    `=== RÈGLES DE STYLE OBLIGATOIRES (Pascal 2026-06-05) ===
INTERDICTION ABSOLUE de markdown dans ta réponse :
- AUCUN **gras**, AUCUN __gras__, AUCUN *italique*, AUCUN _italique_
- AUCUN # ## ### titre
- AUCUNE liste à puces avec "- " ou "* " ou "+ " en début de ligne
- AUCUN tableau, AUCUN \`code\`, AUCUN \`\`\`bloc de code\`\`\`
- Réponds en TEXTE NATUREL plat, comme à l'oral.

EXEMPLES :
BAD : "Je peux te **chercher** des choses : - **Vidéos** - **Restos**"
GOOD : "Je peux chercher des vidéos, des restos, des recettes — dis-moi ce qui t'intéresse."`
  );

  if (analysis.is_meta_question) {
    sections.push(
      `=== RÉGIME QUESTION META ===
La question porte sur Talk2Me / sur toi (comment ça marche, à quoi tu sers, etc.) :
- Réponse COURTE : 1-3 phrases naturelles, max 60 mots.
- AUCUN markdown, AUCUNE liste à puces. Style conversationnel oral.
- Pas de récap exhaustif "Je peux : vidéo / resto / météo / etc." en bloc → choisis 2-3 exemples concrets dans une phrase fluide.

BAD : "Je peux t'aider à : - chercher des vidéos - trouver des restos - donner la météo - faire des recherches"
GOOD : "Je suis ton assistant — tu me demandes un resto, une vidéo, une recette, et je te trouve ça direct."`
    );
  }

  if (analysis.is_identity_question) {
    sections.push(
      `=== RÉGIME QUESTION IDENTITÉ ===
On te demande qui tu es / ton nom / si tu es une IA :
- Tu réponds en parlant DE TOI (ton nom : "${ctx.aiName}"), JAMAIS du nom de l'utilisateur.
- INTERDICTION ABSOLUE de mentionner le display_name / username / prénom de l'user dans ta réponse.
- Si tu veux désigner l'user, dis "tu", "toi", "ton" — JAMAIS son nom propre.
- Reste court : 1-2 phrases.

BAD : "Je suis ${ctx.aiName}, l'IA personnelle de Fuz novice !"
GOOD : "Je suis ${ctx.aiName}, ton IA personnelle sur Talk2Me."

BAD : "Oui, je suis une IA ! Plus précisément, je suis ${ctx.aiName} de Pascal Repir."
GOOD : "Oui, je suis une IA — ${ctx.aiName}, ton IA perso."`
    );
  }

  if (analysis.is_search_intent) {
    const toolHints: string[] = [];
    switch (analysis.intent_category) {
      case 'restaurant':
        toolHints.push(`Tu utilises search_place avec amenity='restaurant' et la ville en city.`);
        break;
      case 'hotel':
        toolHints.push(`Tu utilises search_place avec amenity='hotel' et la ville en city.`);
        break;
      case 'cafe':
        toolHints.push(`Tu utilises search_place avec amenity='cafe' et la ville en city.`);
        break;
      case 'bar':
        toolHints.push(`Tu utilises search_place avec amenity='bar' et la ville en city.`);
        break;
      case 'pharmacy':
        toolHints.push(`Tu utilises search_place avec amenity='pharmacy' et la ville en city.`);
        break;
      case 'music':
      case 'video':
        toolHints.push(`Tu utilises search_youtube avec une query SPÉCIFIQUE (pas un mot brut).`);
        break;
      case 'recipe':
        toolHints.push(`Tu utilises search_recipe avec le nom du plat.`);
        break;
      case 'weather':
        toolHints.push(`Tu utilises get_weather avec city=<ville>.`);
        break;
      case 'voyage':
        toolHints.push(`Tu utilises search_web avec une query enrichie ("vol Paris New York", "train Marseille Lyon").`);
        break;
      case 'shopping':
        toolHints.push(`Tu utilises search_product avec la query courte.`);
        break;
    }

    sections.push(
      [
        `=== RÉGIME RECHERCHE (intent: ${analysis.intent_category || 'inconnu'}) ===`,
        `L'user demande de chercher / trouver quelque chose :`,
        `- INTERDIT de répondre "Je te cherche ça", "Laisse-moi regarder", "Je vais voir", "Un instant", "Voici ce que j'ai trouvé".`,
        `- Appelle DIRECTEMENT le bon tool, SANS annonce conversationnelle.`,
        `- Si tu appelles un tool, ta réponse text peut rester vide "" — la card parle.`,
        toolHints.length > 0 ? `- ${toolHints.join(' ')}` : '',
      ]
        .filter(Boolean)
        .join('\n')
    );
  }

  if (analysis.requires_grounding) {
    sections.push(
      `=== RÉGIME GROUNDING STRICT ===
La demande implique des données factuelles précises (prix, horaire, adresse, chiffres) :
- N'INVENTE JAMAIS de valeur. Si tu n'as pas de tool result, dis simplement : "Je n'ai pas l'info précise — regarde directement sur la source officielle."
- Si tu cites un chiffre, il DOIT venir d'un tool result que tu viens d'obtenir.
- Doctrine [[feedback-content-grounding]] : pas de source → pas de génération.`
    );
  }

  if (sections.length === 0) return '';

  return [
    '',
    '=== PROMPT BUILDER CONTEXTUEL (Pascal #414 — règles ciblées sur ce message) ===',
    ...sections,
    '=== FIN PROMPT BUILDER ===',
    '',
  ].join('\n\n');
}
