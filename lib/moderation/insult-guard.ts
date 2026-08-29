/**
 * Talk2Me — INSULT-GUARD (Pascal 2026-08-29). Détection d'injures, MULTILINGUE et SCALABLE :
 * l'app n'est pas que malgache → 1 entrée par langue dans LEXICONS (clé = code langue ISO 639-1).
 * AJOUTER UNE LANGUE = ajouter une entrée, AUCUNE logique à toucher.
 *
 * 2 niveaux : `leger` (grossièreté → masquée à l'affichage) · `grave` (insulte ciblée / haine /
 * harcèlement → refusée à l'envoi + signalée + avertissement auto). Détection déterministe,
 * gratuite, sur limites de mots + insensible casse/accents (pas de faux positif « connexion »→« con »).
 *
 * Ce module est PUR (0 accès DB) → testable. L'enforcement (report + sanction) est dans insult-enforce.ts.
 */

export type InsultSeverity = 'leger' | 'grave';
interface Lexicon { leger: string[]; grave: string[] }

// Termes en RACINE, SANS accents (le texte est normalisé sans accents avant match). Minuscules.
// Slots par langue : remplis = FR, EN. À remplir = MG (malgache, Pascal = la référence), et autres.
const LEXICONS: Record<string, Lexicon> = {
  fr: {
    leger: ['con', 'conne', 'connard', 'connasse', 'debile', 'idiot', 'imbecile', 'cretin', 'abruti', 'crevard', 'bouffon', 'clochard', 'minable'],
    grave: ['encule', 'enculer', 'nique ta mere', 'ntm', 'fils de pute', 'fdp', 'pute', 'putain de', 'salope', 'batard', 'pd', 'pedale', 'tapette', 'negre', 'bougnoule', 'sale arabe', 'sale juif', 'sale noir', 'sale blanc', 'va te pendre', 'ta gueule', 'ferme ta gueule', 'grosse merde'],
  },
  en: {
    leger: ['idiot', 'stupid', 'moron', 'dumbass', 'loser', 'jerk', 'clown', 'trash', 'pathetic'],
    grave: ['fuck you', 'fuck off', 'motherfucker', 'son of a bitch', 'bitch', 'asshole', 'cunt', 'faggot', 'retard', 'nigger', 'nigga', 'kill yourself', 'kys', 'go die', 'whore', 'slut'],
  },
  // mg: { leger: [], grave: [] }, // MALGACHE — à remplir avec les termes fournis par Pascal (référence).
};

/** Enlève les accents + minuscule + espaces multiples → forme canonique pour le match. */
function normalize(s: string): string {
  return (s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // diacritiques
    .replace(/\s+/g, ' ')
    .trim();
}

// Échappe un terme pour la regex + tolère les espaces (« nique ta mere » ↔ « nique   ta  mere »).
function toPattern(term: string): RegExp {
  const esc = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ +/g, '\\s+');
  return new RegExp(`(?<![\\p{L}\\p{N}])${esc}(?![\\p{L}\\p{N}])`, 'iu');
}

// Pré-compilation (une seule fois) : {severity, term, re} pour toutes les langues.
type Rule = { severity: InsultSeverity; term: string; re: RegExp };
const RULES: Rule[] = (() => {
  const out: Rule[] = [];
  for (const lex of Object.values(LEXICONS)) {
    for (const t of lex.grave) out.push({ severity: 'grave', term: normalize(t), re: toPattern(normalize(t)) });
    for (const t of lex.leger) out.push({ severity: 'leger', term: normalize(t), re: toPattern(normalize(t)) });
  }
  return out;
})();

export interface InsultResult { hit: boolean; severity: InsultSeverity | null; terms: string[] }

/** Analyse un texte sur TOUTES les langues du registre. `grave` prime sur `leger`. */
export function detectInsult(text: string): InsultResult {
  const norm = normalize(text);
  if (!norm) return { hit: false, severity: null, terms: [] };
  const terms: string[] = [];
  let severity: InsultSeverity | null = null;
  for (const r of RULES) {
    if (r.re.test(norm)) {
      terms.push(r.term);
      if (r.severity === 'grave') severity = 'grave';
      else if (severity !== 'grave') severity = 'leger';
    }
  }
  return { hit: severity !== null, severity, terms };
}

/** Masque à l'affichage les injures trouvées (garde la longueur en •). Doctrine : on stocke
 *  l'original (preuve/modération), on masque au RENDU. */
export function maskInsults(text: string): string {
  if (!text) return text;
  let out = text;
  for (const r of RULES) {
    out = out.replace(new RegExp(r.re.source, 'giu'), (m) => '•'.repeat(Math.max(3, m.length)));
  }
  return out;
}

/** Langues actuellement couvertes (pour le monitoring / debug). */
export function coveredLanguages(): string[] {
  return Object.keys(LEXICONS);
}
