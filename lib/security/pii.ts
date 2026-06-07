/**
 * Talk2Me PII air-gap (Pascal 2026-06-05) — Lib commune centralisée.
 *
 * Doctrine [[talk2me-pii-air-gap]] : "cest moi qui peux donner cette info pas
 * lia cette infos en general ne dois meme pas passer dans les tuyaux de lia
 * ni meme la memoriser dans une conversation il dois refuser de la transmetre
 * et dois lefacer en memoire" (Pascal verbatim 2026-06-05).
 *
 * Tous les patterns PII centralisés ICI. Utilisé par les 7 layers air-gap :
 *   1. user-snapshot (system prompt sanitize)
 *   2. tools (SELECT cols safe-only)
 *   3. extract-habits (filter before upsert)
 *   4. conversation history sanitize (Léa + T2M Officiel)
 *   5. output scrubber post-LLM
 *   6. memory-cleaner background
 *   7. system prompts (refus actif)
 *
 * Faux positifs minimisés : dates (8 chiffres typés YYYYMMDD) et prix
 * (< 6 chiffres) ne matchent pas le talk2me_id (exactement 6 chiffres).
 * Quand un faux positif est inévitable (ex. n° tél FR à 10 chiffres avec
 * IBAN), on préfère REDACT plutôt que leak.
 */

/** Liste centrale des patterns PII. Ordre d'application : du plus spécifique au plus générique. */
export const PII_PATTERNS: Array<{ name: string; regex: RegExp }> = [
  // IBAN — préfixe pays + 2 chiffres check + 14-30 alphanumériques (FR/GB/DE/IT/ES/BE/CH/LU/NL/PT).
  // Doit être avant CC (qui matche 13-19 chiffres) pour éviter qu'un IBAN soit
  // capturé partiellement comme CC.
  { name: 'iban', regex: /\b(?:FR|GB|DE|IT|ES|BE|CH|LU|NL|PT)\d{2}\s?[A-Z0-9 ]{14,30}\b/g },
  // Email — pattern strict, exclut espaces.
  { name: 'email', regex: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g },
  // IPv4 — 4 octets séparés par points.
  { name: 'ipv4', regex: /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g },
  // Session token — préfixes Talk2Me (sess_/tok_/magic_) + 20+ chars alphanumeric.
  { name: 'session_token', regex: /\b(?:sess|tok|magic)_[a-zA-Z0-9_-]{20,}\b/g },
  // Carte de crédit — 13-19 chiffres avec séparateurs optionnels (espace ou tiret).
  { name: 'cc', regex: /\b(?:\d[ -]?){13,19}\b/g },
  // Talk2Me ID — exactement 6 chiffres, EN DERNIER (le plus générique).
  // Lookbehind/lookahead : pas de chiffre autour (évite de matcher 7 chiffres = code postal long).
  { name: 'talk2me_id', regex: /(?<!\d)\d{6}(?!\d)/g },
];

/**
 * Retourne true si le texte contient un pattern PII.
 * Optimisé : court-circuit à la première détection.
 */
export function containsPii(text: string | null | undefined): boolean {
  if (!text || typeof text !== 'string') return false;
  for (const p of PII_PATTERNS) {
    // Reset regex global state pour éviter side-effects entre appels
    p.regex.lastIndex = 0;
    if (p.regex.test(text)) return true;
  }
  return false;
}

/**
 * Détaille les PII détectés (pour logs/audit).
 * Retourne un tableau {name, match} (un match par pattern, le premier hit).
 */
export function detectPii(text: string | null | undefined): Array<{ name: string; match: string }> {
  const out: Array<{ name: string; match: string }> = [];
  if (!text || typeof text !== 'string') return out;
  for (const p of PII_PATTERNS) {
    p.regex.lastIndex = 0;
    const m = text.match(p.regex);
    if (m && m[0]) out.push({ name: p.name, match: m[0] });
  }
  return out;
}

/**
 * Remplace tous les patterns PII par [REDACTED]. Conserve le texte autour.
 * Utilisé pour sanitize history avant envoi LLM + scrubber post-LLM (mode soft).
 */
export function scrubPii(text: string | null | undefined): string {
  if (!text || typeof text !== 'string') return text || '';
  let scrubbed = text;
  for (const p of PII_PATTERNS) {
    scrubbed = scrubbed.replace(p.regex, '[REDACTED]');
  }
  return scrubbed;
}
