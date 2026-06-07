/**
 * Tests unitaires — Talk2Me #340 Lot 1bis Couche B (Pascal 2026-06-04).
 *
 * Usage : npx tsx tests/l1bis-coucheB-unit.ts
 *
 * Vérifie :
 *  1. detectIntent matche hotel / restaurant / youtube / weather
 *  2. validateToolCall détecte intent hotel mal routé vers amenity=restaurant
 *  3. validateCardResult REJETTE PlaceCard amenity=restaurant pour intent hotel
 *  4. scrubForbiddenPhrases retire "D'après tes habitudes" et "Je m'appelle Talk2Me"
 *  5. filterToolsForMode gele les tools en card_editor_video
 *  6. Identité standardisée via consciousness.json
 */

import {
  detectIntent,
  validateToolCall,
  type ToolCallProposal,
} from '@/lib/ai/router';
import {
  validateCardResult,
  scrubForbiddenPhrases,
  inferCardKind,
  inferIntendedCardKind,
} from '@/lib/ai/validators';
import { filterToolsForMode, getAllowedTools } from '@/lib/ai/mode-gate';
import { TOOLS } from '@/lib/tools';
import consciousness from '@/lib/ai/consciousness/consciousness.json';

type Check = { name: string; ok: boolean; detail?: string };
const checks: Check[] = [];
function check(name: string, ok: boolean, detail?: string) {
  checks.push({ name, ok, detail });
}

// ---- 1. detectIntent ------------------------------------------------------
{
  const m = detectIntent('Trouve-moi un hôtel à Évry');
  check('detectIntent("hôtel Évry") = hotel', m?.intent === 'hotel', JSON.stringify(m));
}
{
  const m = detectIntent('je veux un resto japonais à Paris');
  check('detectIntent("resto japonais") = restaurant', m?.intent === 'restaurant', JSON.stringify(m));
}
{
  const m = detectIntent('Mets-moi Check de Young Thug');
  check('detectIntent("mets-moi musique") = youtube_video', m?.intent === 'youtube_video', JSON.stringify(m));
}
{
  const m = detectIntent('quelle météo à Marseille');
  check('detectIntent("météo") = weather', m?.intent === 'weather', JSON.stringify(m));
}
{
  const m = detectIntent('Bonjour ça va ?');
  check('detectIntent("Bonjour") = null', m === null, JSON.stringify(m));
}

// ---- 2. validateToolCall --------------------------------------------------
{
  // intent hotel + tool search_place amenity=hotel → OK
  const v = validateToolCall(
    { name: 'search_place', args: { amenity: 'hotel', city: 'Évry' } },
    'hotel',
  );
  check('validateToolCall hotel + amenity=hotel → ok', v.ok, v.reason);
}
{
  // intent hotel + tool search_place amenity=restaurant → KO (bug PROD)
  const v = validateToolCall(
    { name: 'search_place', args: { amenity: 'restaurant', city: 'Évry' } },
    'hotel',
  );
  check(
    'validateToolCall hotel + amenity=restaurant → REJECT',
    !v.ok && (v.reason || '').includes('hotel'),
    v.reason,
  );
}
{
  // intent restaurant + search_youtube → KO (mauvais tool)
  const v = validateToolCall(
    { name: 'search_youtube', args: { query: 'Paris' } },
    'restaurant',
  );
  check(
    'validateToolCall restaurant + search_youtube → REJECT',
    !v.ok,
    v.reason,
  );
}
{
  // intent restaurant + search_web (fallback) → OK
  const v = validateToolCall(
    { name: 'search_web', args: { query: 'site:thefork.fr Paris' } },
    'restaurant',
  );
  check(
    'validateToolCall restaurant + search_web (fallback) → ok',
    v.ok,
    v.reason,
  );
}
{
  // Mode gate : search_youtube gelé en card_editor_video
  const v = validateToolCall(
    { name: 'search_youtube', args: { query: 'x' } },
    'youtube_video',
    'card_editor_video',
  );
  check(
    'validateToolCall search_youtube en card_editor_video → FROZEN',
    !v.ok && (v.reason || '').includes('frozen'),
    v.reason,
  );
}

// ---- 3. validateCardResult ------------------------------------------------
{
  // intent hotel + PlaceCard avec restos → REJECT + action=fallback
  const v = validateCardResult({
    intent: 'hotel',
    card_kind: 'PlaceCard',
    card_data: {
      places: [
        { name: 'Sakae', amenity: 'restaurant', address: 'Évry' },
        { name: 'Le Sushi', amenity: 'restaurant', address: 'Évry' },
      ],
    },
    message_text: '',
  });
  check(
    'validateCardResult intent=hotel + restos → REJECT fallback',
    !v.ok && v.action === 'fallback',
    JSON.stringify(v),
  );
}
{
  // intent hotel + PlaceCard avec hôtels → OK
  const v = validateCardResult({
    intent: 'hotel',
    card_kind: 'PlaceCard',
    card_data: {
      places: [{ name: 'Ibis Évry', tourism: 'hotel', address: 'Évry' }],
    },
    message_text: '',
  });
  check('validateCardResult intent=hotel + hôtels → ok', v.ok, JSON.stringify(v));
}
{
  // intent restaurant + PlaceCard avec restos → OK
  const v = validateCardResult({
    intent: 'restaurant',
    card_kind: 'PlaceCard',
    card_data: {
      places: [{ name: 'Le Bistrot', amenity: 'restaurant' }],
    },
    message_text: '',
  });
  check(
    'validateCardResult intent=restaurant + restos → ok',
    v.ok,
    JSON.stringify(v),
  );
}
{
  // card kind sans data → fallback
  const v = validateCardResult({
    intent: 'restaurant',
    card_kind: 'PlaceCard',
    card_data: [],
    message_text: '',
  });
  check(
    'validateCardResult places=[] → REJECT fallback',
    !v.ok && v.action === 'fallback',
    JSON.stringify(v),
  );
}

// ---- 4. scrubForbiddenPhrases --------------------------------------------
{
  const before =
    "D'après tes habitudes, tu écoutes Young Thug. Voici Check.";
  const after = scrubForbiddenPhrases(before);
  check(
    'scrub retire "d\'après tes habitudes"',
    !after.toLowerCase().includes("d'après tes habitudes"),
    after,
  );
  check(
    'scrub conserve la partie utile',
    after.toLowerCase().includes('check'),
    after,
  );
}
{
  const before = "Je m'appelle Talk2Me. Bonjour Pascal.";
  const after = scrubForbiddenPhrases(before);
  check(
    'scrub retire "Je m\'appelle Talk2Me"',
    !after.toLowerCase().includes("je m'appelle talk2me"),
    after,
  );
}
{
  const before = 'Voici une recette de pizza.';
  const after = scrubForbiddenPhrases(before);
  check(
    'scrub ne touche pas une phrase OK',
    after === before,
    after,
  );
}
{
  // Test pattern "je n'ai pas trouvé" — variantes
  const before = "Je n'ai pas trouvé de résultats. Essaie Google.";
  const after = scrubForbiddenPhrases(before);
  check(
    'scrub retire excuses',
    !after.toLowerCase().includes("je n'ai pas trouvé") &&
      !after.toLowerCase().includes('essaie google'),
    after,
  );
}

// ---- 5. Mode gate --------------------------------------------------------
{
  const allowedChat = getAllowedTools('chat');
  check(
    'mode chat contient search_youtube',
    allowedChat.includes('search_youtube'),
    allowedChat.join(','),
  );
}
{
  const allowedEditor = getAllowedTools('card_editor_video');
  check(
    'mode card_editor_video N\'A PAS search_youtube',
    !allowedEditor.includes('search_youtube'),
    allowedEditor.join(','),
  );
}
{
  const filtered = filterToolsForMode(TOOLS, 'card_editor_video');
  check(
    'filterToolsForMode card_editor_video → liste vide (tools inexistants)',
    filtered.length === 0,
    `filtered=${filtered.length}`,
  );
}
{
  const filtered = filterToolsForMode(TOOLS, 'chat');
  check(
    'filterToolsForMode chat → tools présents',
    filtered.length > 0 && filtered.length === TOOLS.length,
    `count=${filtered.length}/${TOOLS.length}`,
  );
}

// ---- 6. Identité standardisée --------------------------------------------
{
  const tpl = consciousness.ai_identity_template;
  check(
    'consciousness.json self_intro_format présent',
    typeof tpl.self_intro_format === 'string' &&
      tpl.self_intro_format.includes('{ai_name}'),
    tpl.self_intro_format,
  );
  check(
    'consciousness.json never_say contient "Je m\'appelle Talk2Me"',
    Array.isArray(tpl.never_say) &&
      tpl.never_say.some((s: string) =>
        s.toLowerCase().includes("je m'appelle talk2me"),
      ),
  );
}

// ---- 7. inferCardKind ----------------------------------------------------
{
  const k = inferCardKind({ places: [{ amenity: 'restaurant' }] });
  check('inferCardKind places → PlaceCard', k?.kind === 'PlaceCard');
}
{
  const k = inferCardKind({ youtube: { video_id: 'abc' } });
  check('inferCardKind youtube → YouTubeCard', k?.kind === 'YouTubeCard');
}
{
  const k = inferCardKind({});
  check('inferCardKind vide → null', k === null);
}

// ---- 8. P3 #362 — inferIntendedCardKind + validateCardResult empty -------
// Bug source : Overpass timeout/empty → mapped.places=[] → inferCardKind=null
// → validator skipped → fallback chain never triggered → user voit rien.
// Fix : on déduit la card ATTENDUE depuis tool_used/intent et on rejette si
// payload vide.
{
  const k = inferIntendedCardKind({ tool_used: 'search_place', intent: null });
  check('inferIntendedCardKind tool=search_place → PlaceCard', k === 'PlaceCard');
}
{
  const k = inferIntendedCardKind({ tool_used: null, intent: 'hotel' });
  check('inferIntendedCardKind intent=hotel → PlaceCard', k === 'PlaceCard');
}
{
  const k = inferIntendedCardKind({ tool_used: 'search_youtube', intent: null });
  check(
    'inferIntendedCardKind tool=search_youtube → YouTubeCard',
    k === 'YouTubeCard',
  );
}
{
  const k = inferIntendedCardKind({ tool_used: null, intent: null });
  check('inferIntendedCardKind aucun signal → null', k === null);
}
{
  // P3 cas principal : card_kind null + tool_used=search_place + intent=hotel +
  // data vide → DOIT déclencher fallback (avant ce fix : retournait ok=true).
  const v = validateCardResult({
    intent: 'hotel',
    card_kind: null,
    card_data: undefined,
    message_text: '',
    tool_used: 'search_place',
  });
  check(
    'P3 validateCardResult kind=null + tool=search_place + intent=hotel + data=undef → fallback',
    !v.ok && v.action === 'fallback',
    JSON.stringify(v),
  );
}
{
  // P3 cas places=[] envoyé comme objet { places: [] } (forme route.ts).
  const v = validateCardResult({
    intent: 'hotel',
    card_kind: null,
    card_data: { places: [] },
    message_text: '',
    tool_used: 'search_place',
  });
  check(
    'P3 validateCardResult kind=null + card_data={places:[]} → fallback',
    !v.ok && v.action === 'fallback',
    JSON.stringify(v),
  );
}
{
  // P3 cas restaurant + 0 results.
  const v = validateCardResult({
    intent: 'restaurant',
    card_kind: null,
    card_data: undefined,
    message_text: '',
    tool_used: 'search_place',
  });
  check(
    'P3 validateCardResult intent=restaurant + tool=search_place + empty → fallback',
    !v.ok && v.action === 'fallback',
    JSON.stringify(v),
  );
}
{
  // Non-régression : intent général + tool_used inconnu + data vide → ok
  // (pas de card attendue inférable → on ne casse rien).
  const v = validateCardResult({
    intent: null,
    card_kind: null,
    card_data: undefined,
    message_text: 'Hello',
    tool_used: null,
  });
  check(
    'P3 non-régression : aucun signal card → ok',
    v.ok,
    JSON.stringify(v),
  );
}
{
  // Non-régression : intent hotel + PlaceCard + vraies données → ok
  const v = validateCardResult({
    intent: 'hotel',
    card_kind: 'PlaceCard',
    card_data: { places: [{ amenity: 'hotel', name: 'Test' }] },
    message_text: '',
    tool_used: 'search_place',
  });
  check(
    'P3 non-régression : PlaceCard avec hotel valide → ok',
    v.ok,
    JSON.stringify(v),
  );
}

// ==== Print results ========================================================
console.log('\n=== TESTS UNITAIRES Lot 1bis Couche B ===\n');
let failed = 0;
for (const c of checks) {
  const tag = c.ok ? 'OK ' : 'KO ';
  if (!c.ok) failed++;
  const det = c.detail && !c.ok ? ` — ${c.detail}` : '';
  console.log(`[${tag}] ${c.name}${det}`);
}
console.log(
  `\n${failed === 0 ? '✓ ALL ' + checks.length + ' CHECKS PASSED' : `✗ ${failed}/${checks.length} CHECK(S) FAILED`}`,
);
process.exit(failed === 0 ? 0 : 1);
