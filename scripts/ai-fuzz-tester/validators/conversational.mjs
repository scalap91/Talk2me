/**
 * Validator CONVERSATIONAL — vérifie que la réponse texte est conversationnelle :
 *  - Pas de markdown brut excessif (** ## --- ```)
 *  - Pas trop longue (> 800 chars sans card = suspect, "récite l'encyclopédie")
 *  - Pas de listes en bloc structurées si réponse courte attendue
 *
 * Doctrine [[talktome-cards-primaute]] : si une card est présente, le texte
 * doit être très court (≤200 chars idéalement).
 */

const MARKDOWN_PATTERNS = [
  /\*\*[^*]+\*\*/g,            // **gras**
  /^#{1,6}\s+/gm,              // headers
  /^[-*]\s+.+\n[-*]\s+/m,      // bullet list 2+ items
  /```[a-z]*\n/m,              // code block
  /\[[^\]]+\]\([^)]+\)/g,      // [text](url)
];

export function validateConversational(prompt, response) {
  const text = (response.text || '').toString();
  if (!text) {
    // Texte vide : OK si une card a été produite, sinon FAIL
    const hasCard =
      response.youtube || response.tiktok ||
      (Array.isArray(response.places) && response.places.length > 0) ||
      response.recipe || response.wikipedia || response.weather ||
      (Array.isArray(response.products) && response.products.length > 0) ||
      response.web_search;
    if (hasCard) return { name: 'conversational', pass: true, reason: 'card-only (text empty)' };
    return { name: 'conversational', pass: false, reason: 'texte vide ET pas de card' };
  }

  // Markdown brut : compte les occurrences
  let mdHits = 0;
  for (const re of MARKDOWN_PATTERNS) {
    const matches = text.match(re);
    if (matches) mdHits += matches.length;
  }
  // Tolérance : max 1 markdown léger par 500 caractères
  const tolerance = Math.max(1, Math.floor(text.length / 500));
  if (mdHits > tolerance) {
    return {
      name: 'conversational',
      pass: false,
      reason: `markdown brut excessif (${mdHits} occurrences > tolérance ${tolerance})`,
    };
  }

  // Texte trop long sans card
  const hasCard =
    response.youtube ||
    (Array.isArray(response.places) && response.places.length > 0) ||
    response.recipe || response.wikipedia || response.weather;
  if (!hasCard && text.length > 1200) {
    return {
      name: 'conversational',
      pass: false,
      reason: `texte trop long sans card (${text.length} chars)`,
    };
  }

  // Texte trop long AVEC card (doctrine cards-primauté : text muet ou court)
  if (hasCard && text.length > 400) {
    return {
      name: 'conversational',
      pass: false,
      reason: `texte trop long avec card (${text.length} chars > 400, doctrine cards-primauté)`,
    };
  }

  return { name: 'conversational', pass: true, reason: 'ok' };
}
