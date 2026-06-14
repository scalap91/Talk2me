/**
 * Talk2Me — Normalisation du texte AVANT synthèse vocale (Pascal 2026-06-11).
 * Les voix prononçaient mal « Talk2Me » / « T2M » (le « 2 » lu « deux » en
 * français). On réécrit la marque en une forme que la voix prononce bien :
 *   - voix françaises  → « Tok tou mi » (phonétique de "talk to me")
 *   - voix anglaises   → « Talk to me » (les vrais mots)
 * S'applique UNIQUEMENT à la voix off, jamais au texte affiché (captions).
 */
export function normalizeForSpeech(text: string, lang = 'fr'): string {
  if (!text) return text;
  // Pascal 2026-06-11 : « le 1 sonne le mieux » = « Talk to me » prononcé à l'anglaise.
  // On garde les vrais mots anglais (jamais le « 2 » lu « deux », jamais de phonétique bricolée).
  void lang;
  const brand = 'Talk to me';
  return text
    // Talk2Me / Talk 2 Me / TalkToMe / Talk To Me
    .replace(/\bTalk\s*(?:2|to|two)\s*me\b/gi, brand)
    // T2M / T.2.M / T 2 M (sigle)
    .replace(/\bT\s*[.\-]?\s*2\s*[.\-]?\s*M\b/gi, brand);
}
