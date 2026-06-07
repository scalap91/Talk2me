/**
 * Validator JSON-LEAK — cherche des fuites de pipeline interne dans le texte
 * conversationnel : tool_calls, function:, arguments:, JSON brut, backticks
 * triples, balises <json> non strippées.
 */

const LEAK_PATTERNS = [
  /\btool_calls\b/i,
  /\barguments\s*[:=]/i,
  /\bfunction\s*[:=]/i,
  /```[a-z]*\n[\s\S]*?```/m, // bloc de code triple-backtick
  /<json>[\s\S]*?<\/json>/i,
  /\bsearch_youtube\s*\(/i,
  /\bsearch_place\s*\(/i,
  /\bsearch_recipe\s*\(/i,
  /\bget_weather\s*\(/i,
  /\bfetch_url_content\s*\(/i,
  /\bsearch_web\s*\(/i,
  /\bsearch_wikipedia\s*\(/i,
  /\bHANDLERS\b/,
  /\bTOOLS\b/,
];

export function validateJsonLeak(prompt, response) {
  const text = (response.text || '').toString();
  if (!text) return { name: 'json_leak', pass: true, reason: 'empty text' };
  for (const re of LEAK_PATTERNS) {
    const m = text.match(re);
    if (m) {
      return {
        name: 'json_leak',
        pass: false,
        reason: `pipeline leak: "${m[0].slice(0, 60)}"`,
      };
    }
  }
  return { name: 'json_leak', pass: true, reason: 'no leak' };
}
