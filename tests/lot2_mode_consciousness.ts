/**
 * Talk2Me #341 — Lot 2 N8/N9 (Pascal 2026-06-04).
 *
 * Tests :
 *  1. normalizeMode : entrée invalide → 'chat'
 *  2. normalizeMode : 'card_editor_video' valide
 *  3. filterToolsForMode : mode chat → tous les tools search_*
 *  4. filterToolsForMode : mode card_editor_video → 0 tool search_* (gelés)
 *  5. Bloc consciousness en mode chat → contient skills active CHAT
 *  6. Bloc consciousness en mode card_editor_video → contient :
 *     - section "MODE ACTUEL : Éditeur vidéo"
 *     - skills actives vidéo (trim, cover, texte overlay)
 *     - skills gelées (Recherche YouTube, lieu, web)
 *     - règle hors-périmètre
 *  7. Cache : keys séparées par mode (mêmes user, modes différents → blocs différents)
 *
 *  Usage : `cd /home/ubuntu/talktome && npx tsx tests/lot2_mode_consciousness.ts`
 */

import { TOOLS } from '@/lib/tools';
import {
  filterToolsForMode,
  normalizeMode,
  getModeLabel,
  getSkillsActiveFr,
  getSkillsFrozenFr,
} from '@/lib/ai/mode-gate';
import { buildConsciousness, invalidateConsciousness } from '@/lib/ai/consciousness';
import * as fs from 'node:fs';

const TEST_USER_ID = '9e8c6cc2-4dc4-4ff6-bf0e-74a330a15e65'; // pascal_test

interface Check {
  name: string;
  ok: boolean;
  detail?: string;
}

async function main() {
  const checks: Check[] = [];

  // 1. normalizeMode invalide
  const norm1 = normalizeMode('invalid_mode_xyz');
  checks.push({
    name: 'normalizeMode("invalid_mode_xyz") → "chat"',
    ok: norm1 === 'chat',
    detail: `got "${norm1}"`,
  });

  // 2. normalizeMode valide
  const norm2 = normalizeMode('card_editor_video');
  checks.push({
    name: 'normalizeMode("card_editor_video") → "card_editor_video"',
    ok: norm2 === 'card_editor_video',
    detail: `got "${norm2}"`,
  });

  // 2b. normalizeMode card_editor_text (nouveau Lot 2)
  const norm3 = normalizeMode('card_editor_text');
  checks.push({
    name: 'normalizeMode("card_editor_text") → "card_editor_text"',
    ok: norm3 === 'card_editor_text',
    detail: `got "${norm3}"`,
  });

  // 3. filterToolsForMode chat → search_* présents
  const chatTools = filterToolsForMode(TOOLS, 'chat');
  const chatNames = chatTools
    .map((t) => (t as { function?: { name?: string } }).function?.name)
    .filter(Boolean) as string[];
  checks.push({
    name: 'filterToolsForMode(chat) inclut search_place',
    ok: chatNames.includes('search_place'),
    detail: chatNames.join(','),
  });
  checks.push({
    name: 'filterToolsForMode(chat) inclut search_youtube',
    ok: chatNames.includes('search_youtube'),
  });
  checks.push({
    name: 'filterToolsForMode(chat) inclut search_web',
    ok: chatNames.includes('search_web'),
  });

  // 4. filterToolsForMode card_editor_video → AUCUN search_*
  const editorTools = filterToolsForMode(TOOLS, 'card_editor_video');
  const editorNames = editorTools
    .map((t) => (t as { function?: { name?: string } }).function?.name)
    .filter(Boolean) as string[];
  const hasAnySearch = editorNames.some((n) => n.startsWith('search_') || n === 'get_weather' || n === 'fetch_url_content');
  checks.push({
    name: 'filterToolsForMode(card_editor_video) : AUCUN tool search_/get_weather/fetch_url_content',
    ok: !hasAnySearch,
    detail: editorNames.join(',') || '(empty)',
  });

  // 5. Labels et skills FR
  checks.push({
    name: 'getModeLabel("card_editor_video") === "Éditeur vidéo"',
    ok: getModeLabel('card_editor_video') === 'Éditeur vidéo',
  });
  checks.push({
    name: 'getSkillsActiveFr("card_editor_video") inclut "Découper la vidéo (trim)"',
    ok: getSkillsActiveFr('card_editor_video').some((s) => /Découper/i.test(s)),
  });
  checks.push({
    name: 'getSkillsFrozenFr("card_editor_video") inclut "Recherche YouTube"',
    ok: getSkillsFrozenFr('card_editor_video').includes('Recherche YouTube'),
  });
  checks.push({
    name: 'getSkillsFrozenFr("chat") === [] (rien gelé)',
    ok: getSkillsFrozenFr('chat').length === 0,
  });

  // 6. Bloc consciousness en mode chat
  invalidateConsciousness(TEST_USER_ID);
  const blockChat = await buildConsciousness({ userId: TEST_USER_ID, mode: 'chat' });
  checks.push({
    name: 'bloc[chat] contient "MODE ACTUEL : Chat conversationnel"',
    ok: blockChat.includes('MODE ACTUEL : Chat conversationnel'),
  });
  checks.push({
    name: 'bloc[chat] contient "Conversation naturelle" en active',
    ok: blockChat.includes('Conversation naturelle'),
  });
  checks.push({
    name: 'bloc[chat] NE contient PAS "compétences GELÉES"',
    ok: !blockChat.includes('compétences GELÉES'),
  });

  // 7. Bloc consciousness en mode card_editor_video
  invalidateConsciousness(TEST_USER_ID);
  const blockEditor = await buildConsciousness({
    userId: TEST_USER_ID,
    mode: 'card_editor_video',
  });
  checks.push({
    name: 'bloc[card_editor_video] contient "MODE ACTUEL : Éditeur vidéo"',
    ok: blockEditor.includes('MODE ACTUEL : Éditeur vidéo'),
  });
  checks.push({
    name: 'bloc[card_editor_video] contient skill active "Découper la vidéo"',
    ok: blockEditor.includes('Découper la vidéo'),
  });
  checks.push({
    name: 'bloc[card_editor_video] contient skill gelée "Recherche YouTube"',
    ok: blockEditor.includes('Recherche YouTube'),
  });
  checks.push({
    name: 'bloc[card_editor_video] contient "compétences GELÉES"',
    ok: blockEditor.includes('compétences GELÉES'),
  });
  checks.push({
    name: 'bloc[card_editor_video] contient RÈGLE HORS-PÉRIMÈTRE',
    ok: blockEditor.includes('RÈGLE HORS-PÉRIMÈTRE'),
  });
  checks.push({
    name: 'bloc[card_editor_video] mentionne label dans la réponse type',
    ok: blockEditor.includes('Je suis en mode Éditeur vidéo'),
  });

  // 8. Cache séparé par mode
  checks.push({
    name: 'bloc[chat] != bloc[card_editor_video] (cache séparé par mode)',
    ok: blockChat !== blockEditor,
  });

  // 9. Bloc card_editor_image
  invalidateConsciousness(TEST_USER_ID);
  const blockImg = await buildConsciousness({
    userId: TEST_USER_ID,
    mode: 'card_editor_image',
  });
  checks.push({
    name: 'bloc[card_editor_image] contient "MODE ACTUEL : Éditeur image"',
    ok: blockImg.includes('MODE ACTUEL : Éditeur image'),
  });

  // Dump bloc card_editor_video pour preuve
  const dumpPath = '/home/ubuntu/dashboard/uploads/talk2me_lot2_consciousness_block_editor.txt';
  fs.writeFileSync(
    dumpPath,
    `=== CONSCIOUSNESS BLOCK (mode=card_editor_video, user=${TEST_USER_ID}) ===\n\n` +
      blockEditor +
      '\n',
    'utf-8',
  );
  console.log(`Dump écrit : ${dumpPath} (${blockEditor.length} chars)`);

  // Affiche les checks
  console.log('\n=== CHECKS Lot 2 ===');
  let failed = 0;
  for (const c of checks) {
    const tag = c.ok ? 'OK ' : 'KO ';
    if (!c.ok) failed++;
    const detail = c.detail ? `  [${c.detail}]` : '';
    console.log(`[${tag}] ${c.name}${detail}`);
  }
  console.log(
    `\n${failed === 0 ? 'ALL CHECKS PASSED' : `${failed} CHECK(S) FAILED`}`,
  );
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
