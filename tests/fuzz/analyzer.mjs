/**
 * Talk2Me Fuzz Analyzer — classifie chaque interaction (OK / WARN / BUG / REGRESSION).
 *
 * Critères (cf. mission Pascal 2026-06-04) :
 *  - 🔴 REGRESSION : URL cassée (placeholders {…}), erreur 500, card mauvaise
 *    catégorie vs intent, response status non-200.
 *  - 🟠 BUG : pipeline leak ("d'après tes habitudes", "je cherche pour toi"),
 *    card pertinente absente alors qu'attendue, intent ambigu mais tool quand
 *    même appelé (doctrine ambigu → 1 question), forbidden phrases ("essaie
 *    Google", "je n'ai pas accès").
 *  - 🟡 WARN : latence >10s, text vide + card vide, expected_card mismatch
 *    mineur, doctrine soft warning (texte trop long avec card).
 *  - ✅ OK : tout conforme.
 */

const PLACEHOLDER_RE = /\{\w+\}/;
const PIPELINE_LEAK_RE = /(d'après tes habitudes|selon ta mémoire|je cherche pour toi|je vais regarder|laisse-moi chercher|un instant|d'après ce que je sais de toi|d'après ma mémoire)/i;
const FORBIDDEN_PHRASE_RE = /(essaie google|essaie booking|je n'ai pas accès|je n'ai pas trouvé|mes connaissances sont limitées|je n'ai pas le contexte|je n'ai pas de mémoire|je ne dispose pas|j'ai trouvé plusieurs résultats)/i;
const META_LEAK_RE = /(`search_|amenity=|`get_weather`|n'est pas un type|le tool\b|l'outil\b|je m'appelle Talk2Me\b|je suis Talk2Me\b)/i;
const FAUX_URL_RE = /https?:\/\/[^/]*\/[a-z]+\/\/[a-z]\//; // pattern type skyscanner.fr/vols/de//a/

export function classify(ctx) {
  const { prompt, status, response, card_kind, urls, elapsed_ms } = ctx;
  const reasons = [];
  let level = 0; // 0=OK 1=WARN 2=BUG 3=REGRESSION

  const escalate = (lvl, reason) => {
    if (lvl > level) level = lvl;
    reasons.push(reason);
  };

  // --- 1. Status HTTP ---
  if (status !== 200) {
    escalate(3, `http-status-${status}`);
  }
  if (status === -1) {
    escalate(3, 'fetch-error');
    return { verdict: 'REGRESSION', reasons };
  }

  // --- 2. URLs cassées (placeholders ou patterns vides) ---
  const urlsArr = Array.isArray(urls) ? urls : [];
  for (const u of urlsArr) {
    if (typeof u !== 'string') continue;
    if (PLACEHOLDER_RE.test(u)) {
      escalate(3, `url-placeholder: ${u.slice(0, 80)}`);
    } else if (FAUX_URL_RE.test(u)) {
      escalate(3, `url-empty-segments: ${u.slice(0, 80)}`);
    } else if (u.includes('//a/') || u.includes('//de/') || u.match(/\/[a-z]\/$/)) {
      // Pas une régression certaine, mais suspect
      if (u.match(/\/de\/\/a\/|\/from\/\/to\//)) {
        escalate(3, `url-empty-template-segment: ${u.slice(0, 80)}`);
      }
    }
  }

  // --- 3. Texte = pipeline leak ou forbidden phrase ---
  const text = (response.text || '').toString();
  if (text && PIPELINE_LEAK_RE.test(text)) {
    escalate(2, 'pipeline-leak');
  }
  if (text && FORBIDDEN_PHRASE_RE.test(text)) {
    escalate(2, 'forbidden-phrase');
  }
  if (text && META_LEAK_RE.test(text)) {
    escalate(2, 'meta-leak');
  }

  // --- 4. Doctrine ambigu (mot brut) → tool ne doit PAS être appelé ---
  if (prompt.category === 'ambiguous') {
    if (card_kind) {
      escalate(2, `ambiguous-but-tool-called (card=${card_kind})`);
    }
  }

  // --- 5. Doctrine conversational : ZÉRO tool attendu ---
  if (prompt.category === 'conversational') {
    if (card_kind) {
      escalate(2, `conversational-but-tool-called (card=${card_kind})`);
    }
    if (!text || text.length < 2) {
      escalate(1, 'conversational-empty-reply');
    }
  }

  // --- 6. Card type mismatch vs expected ---
  if (prompt.expected_card && card_kind && prompt.expected_card !== card_kind) {
    // PlaceCard expected mais PlaceSearchTrigger reçu = OK (front fera geoloc)
    const acceptable = (
      (prompt.expected_card === 'PlaceCard' && card_kind === 'PlaceSearchTrigger') ||
      (prompt.expected_card === 'SearchResultCard' && card_kind === 'WikipediaCard') ||
      (prompt.expected_card === 'SearchResultCard' && card_kind === 'YouTubeCard')
    );
    if (!acceptable) {
      escalate(2, `wrong-card (expected=${prompt.expected_card} got=${card_kind})`);
    }
  }

  // --- 7. Card attendue mais absente ---
  if (prompt.expected_card && !card_kind && !text) {
    escalate(2, 'expected-card-missing (and empty text)');
  }
  if (prompt.expected_card && !card_kind && text.length < 30) {
    // Texte trop court pour faire office de conv-avant-recherche
    escalate(1, 'expected-card-missing (short text only)');
  }

  // --- 8. Card constraint pour hotel/restaurant ---
  if (prompt.expected_intent === 'hotel' && Array.isArray(response.places)) {
    const wrongAmenity = response.places.find(p => p.amenity && p.amenity !== 'hotel');
    if (wrongAmenity) {
      escalate(3, `hotel-intent-but-place-amenity=${wrongAmenity.amenity}`);
    }
  }
  if (prompt.expected_intent === 'restaurant' && Array.isArray(response.places)) {
    const wrongAmenity = response.places.find(p =>
      p.amenity && !['restaurant', 'cafe', 'fast_food', 'bar', 'bakery'].includes(p.amenity)
    );
    if (wrongAmenity) {
      escalate(3, `restaurant-intent-but-place-amenity=${wrongAmenity.amenity}`);
    }
  }

  // --- 9. Latence ---
  if (elapsed_ms > 15000) {
    escalate(2, `slow >15s (${elapsed_ms}ms)`);
  } else if (elapsed_ms > 10000) {
    escalate(1, `slow >10s (${elapsed_ms}ms)`);
  }

  // --- 10. Text + card simultanés > 200 chars (doctrine cards-primauté) ---
  if (card_kind && text && text.length > 250) {
    escalate(1, 'cards-primaute-violated (long text + card)');
  }

  // --- 11. Flight: vérification spécifique sur les URLs Skyscanner-like ---
  if (prompt.category === 'flight') {
    const hasFlightUrl = urlsArr.some(u =>
      u.includes('skyscanner') || u.includes('kayak') || u.includes('flight')
    );
    if (!hasFlightUrl && !card_kind && !text) {
      escalate(2, 'flight-no-output');
    }
  }

  // --- 12. Emoji seul (tricky) — ne doit pas crasher ---
  if (prompt.text === '🍕' && !text) {
    // Acceptable de répondre rien ou de poser question
    escalate(1, 'emoji-only-no-text-reply');
  }

  const verdictMap = ['OK', 'WARN', 'BUG', 'REGRESSION'];
  return { verdict: verdictMap[level], reasons };
}
