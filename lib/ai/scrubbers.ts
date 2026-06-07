/**
 * Talk2Me #414 — Scrubbers post-LLM renforcés (Pascal 2026-06-05).
 *
 * Trois scrubbers ciblés qui s'appliquent EN CHAÎNE sur toutes les sorties
 * Léa (solo /api/chat + P2P /api/conversations/[id]/messages + officiel).
 *
 * Bugs ciblés (mesurés par fuzz tester #405) :
 *  1. Markdown leak (** ## - ` ```) → ~40-50% des réponses novice
 *  2. Leak nom user : "Je suis T2M de Fuz novice" → fuit display_name
 *  3. Annonces "je te cherche ça" sans tool call
 *
 * Ces scrubbers complètent (ne remplacent pas) :
 *  - scrubForbiddenPhrases (validators.ts) — phrase-level
 *  - stripMarkdown (P2P route) — regex moins agressives
 *  - scrubPii (security/pii.ts) — PII air-gap
 *
 * Doctrine :
 *  - [[feedback-talktome-conversation-avant-recherche]]
 *  - [[talk2me-pii-air-gap]]
 *  - [[talktome-no-excuses]]
 *  - [[feedback-modular-no-scattered-patches]] — 1 module, branché 3 fois.
 */

/**
 * Retire AGRESSIVEMENT tout marqueur markdown : gras, italique, titres,
 * bullets, code blocks, code inline. Le texte reste lisible, plat,
 * conversationnel.
 *
 * Plus strict que stripMarkdown() (P2P) parce que DeepSeek génère souvent
 *   "- **Discuter** avec toi en mode conversation"
 *   "- **Chercher des trucs**"
 * que stripMarkdown laisse passer (le tiret reste considéré comme list-marker
 * acceptable). Ici on retire AUSSI les tirets en début de ligne.
 */
export function stripMarkdownAggressive(text: string): string {
  if (!text) return '';
  let out = text;

  // Code blocks ```...``` (multiline) — first to avoid eating inside markup
  out = out.replace(/```[\s\S]*?```/g, '');

  // Liens markdown [label](url) → label
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1');

  // Gras ** ** et __ __ (double underscore d'abord pour éviter conflit avec _italique_)
  out = out.replace(/\*\*([^*]+)\*\*/g, '$1');
  out = out.replace(/__([^_]+)__/g, '$1');

  // Italique * * (pas ** déjà géré) et _ _ (mais protège underscores au milieu d'un mot type ai_name)
  out = out.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '$1');
  out = out.replace(/(^|[\s.,!?;:(])_([^_\n]+)_(?=[\s.,!?;:)]|$)/g, '$1$2');

  // Titres # ## ### (en début de ligne)
  out = out.replace(/^#{1,6}\s+/gm, '');

  // Bullets - * + en début de ligne (avec ou sans espaces avant)
  out = out.replace(/^\s*[-*+]\s+/gm, '');

  // Listes numérotées 1. 2. 3.
  out = out.replace(/^\s*\d+\.\s+/gm, '');

  // Code inline `x` → x
  out = out.replace(/`([^`\n]+)`/g, '$1');

  // Tableaux markdown (lignes commençant par |)
  out = out.replace(/^\s*\|.+\|\s*$/gm, '');

  // Lignes horizontales --- ou ***
  out = out.replace(/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/gm, '');

  // Blockquotes >
  out = out.replace(/^\s*>\s+/gm, '');

  // Nettoie les sauts de ligne triple → double
  out = out.replace(/\n{3,}/g, '\n\n');

  return out.trim();
}

/**
 * Retire toute mention du display_name de l'utilisateur dans la réponse Léa.
 *
 * Bug ciblé : Léa répond "Je suis T2M de Fuz novice !" — elle fuit le nom
 * propre de l'user dans sa propre identité. C'est doublement gênant :
 *  - le user voit son propre nom recopié dans la réponse
 *  - dans un contexte tiers (futur P2P, agent partagé), c'est un leak PII
 *
 * Stratégie :
 *  1. "Je suis T2M de <name>" / "Je suis l'IA de <name>" → "Je suis ton IA"
 *  2. Toute mention isolée du <name> → "toi"
 *  3. "T2M de <name>" en référence à soi → "ton IA"
 *
 * Ne touche pas si userDisplayName est null/vide.
 */
export function scrubUserNameLeak(
  text: string,
  userDisplayName: string | null | undefined
): string {
  if (!text || !userDisplayName) return text || '';
  const name = userDisplayName.trim();
  if (name.length < 2) return text;

  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  let out = text;

  // 1. "Je suis T2M de <name>" / "Je suis l'IA de <name>" / "Je suis ton IA de <name>"
  //    → "Je suis ton IA"
  out = out.replace(
    new RegExp(
      `Je suis (?:l['']?IA|T2M|ton IA|votre IA) (?:de |du |d['']\\s*)${escaped}\\b`,
      'gi'
    ),
    "Je suis ton IA"
  );

  // 2. "T2M de <name>" / "IA de <name>" en référence (sans "Je suis")
  //    → "ton IA"
  out = out.replace(
    new RegExp(`(?:T2M|l['']?IA) (?:de |du |d['']\\s*)${escaped}\\b`, 'gi'),
    "ton IA"
  );

  // 3. Mention isolée du nom : "Salut <name>" / "Bonjour <name>" / fin de phrase
  //    → "Salut" / "Bonjour" / "" (on retire la mention)
  //    On évite de remplacer les mots qui contiennent le nom comme sous-chaîne
  //    (word boundaries).
  out = out.replace(
    new RegExp(`\\b${escaped}\\b`, 'g'),
    ''
  );

  // Nettoie les ", , " et doubles espaces qui peuvent résulter
  out = out.replace(/\s{2,}/g, ' ').replace(/\s+([.,!?;:])/g, '$1').replace(/,\s*,/g, ',');

  return out.trim();
}

/**
 * Retire les phrases d'ANNONCE de recherche qui ne sont suivies d'aucun tool
 * call (et qui sont donc inutiles / mensongères).
 *
 * Doctrine [[feedback-talktome-conversation-avant-recherche]] :
 *   PAS de "Je cherche ça pour toi…", "Laisse-moi chercher…"
 *
 * Patterns ciblés (case-insensitive, début de phrase ou après ponctuation) :
 *  - "Je te cherche ça"
 *  - "Je cherche ça"
 *  - "Laisse-moi (chercher|regarder|voir)"
 *  - "Attends un instant"
 *  - "Un instant"
 *  - "Voici ce que j'ai trouvé"
 *  - "Je vais (regarder|chercher|voir)"
 *  - "Je vais (te) chercher"
 *  - "tout de suite" (en queue de phrase)
 *  - "Je m'occupe de ça"
 */
const ANNONCE_PATTERNS: RegExp[] = [
  /\bJe (?:te |t['']\s*)?cherche [çc]a(?:\s+tout de suite)?(?:\s*pour toi)?[.!?,]*/gi,
  /\bLaisse[- ]moi (?:chercher|regarder|voir|jeter un coup d['']œil)[^.!?]*[.!?]?/gi,
  /\bAttends un instant[^.!?]*[.!?]?/gi,
  /\bUn instant[, ]+je [^.!?]+[.!?]?/gi,
  /\bVoici ce que j['']ai trouvé[^.!?]*[:.!?]?/gi,
  /\bJe vais (?:regarder|chercher|voir|jeter|fouiller)[^.!?]*[.!?]?/gi,
  /\bJe m['']occupe de [çc]a[^.!?]*[.!?]?/gi,
  /\bJe te trouve [çc]a[^.!?]*[.!?]?/gi,
  /\bC['']est parti[, ]+je [^.!?]+[.!?]?/gi,
];

export function scrubAnnonceRecherche(text: string): string {
  if (!text) return '';
  let out = text;
  for (const re of ANNONCE_PATTERNS) {
    out = out.replace(re, '');
  }
  // Nettoie doubles espaces / sauts de ligne créés par les suppressions
  out = out.replace(/\s{2,}/g, ' ').replace(/\n\s*\n\s*\n/g, '\n\n');
  return out.trim();
}

/**
 * Chaîne complète : applique stripMarkdownAggressive → scrubUserNameLeak →
 * scrubAnnonceRecherche dans cet ordre. Helper de commodité pour les call
 * sites qui veulent tout d'un coup.
 *
 * Ne touche PAS à scrubPii / scrubForbiddenPhrases (qui restent appliqués
 * séparément côté route — séparation des responsabilités).
 */
export function scrubLeaOutput(
  text: string,
  opts: { userDisplayName?: string | null } = {}
): string {
  if (!text) return '';
  let out = stripMarkdownAggressive(text);
  out = scrubUserNameLeak(out, opts.userDisplayName ?? null);
  out = scrubAnnonceRecherche(out);
  return out;
}
