#!/usr/bin/env node
/**
 * Talk2Me — Purge des route_learnings empoisonnés par le fuzz #349 (2026-06-04).
 *
 * Contexte : le fuzz 100 prompts a appris 10× `hotel → ["search_web"]` (chemin
 * Booking homepage) + 1× `restaurant → ["search_web"]`, ce qui empoisonne les
 * prochaines décisions du router (boost de la route fallback alors que la
 * doctrine veut PlaceCard tourism=hotel via Overpass).
 *
 * Stratégie de purge :
 *  - DROP route_learnings pollués (intent=hotel|restaurant chaîne search_web ou external_redirect)
 *  - DROP TOUS les route_learnings + user_habits du compte fuzz-bot (pour repartir propre)
 *  - GARDE le compte user fuzz-bot lui-même (Pascal veut pouvoir re-tester)
 *
 * Mode dry-run par défaut. Passer `--apply` pour exécuter.
 *
 * Usage :
 *   node scripts/purge-fuzz-learnings.mjs            # dry-run
 *   node scripts/purge-fuzz-learnings.mjs --apply    # vraie purge
 */

import Database from 'better-sqlite3';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.resolve(__dirname, '..', 'data', 'talktome.db');
const FUZZ_EMAIL = 'fuzz-bot-2026-06-04@example.local';

const APPLY = process.argv.includes('--apply');

function header(s) {
  console.log('\n=== ' + s + ' ===');
}

function main() {
  const db = new Database(DB_PATH);
  console.log(`[purge] DB = ${DB_PATH}`);
  console.log(`[purge] mode = ${APPLY ? 'APPLY (will delete)' : 'DRY-RUN'}`);

  // 1. Inspecter route_learnings pollués (toutes users)
  header('route_learnings globalement pollués (intent hotel/restaurant via search_web ou external_redirect)');
  const polluted = db
    .prepare(
      `SELECT id, user_id, intent, tool_chain, occurrences, success_score
       FROM route_learnings
       WHERE (intent = 'hotel' OR intent = 'restaurant')
         AND (tool_chain LIKE '%search_web%' OR tool_chain LIKE '%external_redirect%')`
    )
    .all();
  console.log(`  ${polluted.length} rows`);
  for (const r of polluted) {
    console.log(`   - id=${r.id.slice(0, 8)} user=${r.user_id.slice(0, 8)} intent=${r.intent} chain=${r.tool_chain} occ=${r.occurrences} score=${r.success_score}`);
  }

  // 2. Inspecter le user fuzz-bot
  header('User fuzz-bot');
  const fuzzUser = db.prepare('SELECT id, email, talk2me_id, username FROM users WHERE email = ?').get(FUZZ_EMAIL);
  if (!fuzzUser) {
    console.log(`  (aucun user ${FUZZ_EMAIL} — rien à purger côté fuzz)`);
  } else {
    console.log(`  id=${fuzzUser.id} talk2me_id=${fuzzUser.talk2me_id} username=${fuzzUser.username}`);
    const fuzzLearnings = db
      .prepare('SELECT COUNT(*) AS c FROM route_learnings WHERE user_id = ?')
      .get(fuzzUser.id).c;
    const fuzzHabits = db
      .prepare('SELECT COUNT(*) AS c FROM user_habits WHERE user_id = ?')
      .get(fuzzUser.id).c;
    console.log(`  route_learnings = ${fuzzLearnings}`);
    console.log(`  user_habits     = ${fuzzHabits}`);
  }

  if (!APPLY) {
    console.log('\n[purge] dry-run terminé — relancer avec --apply pour exécuter.');
    db.close();
    return;
  }

  header('APPLY — purge en cours');
  let deletedPolluted = 0;
  let deletedFuzzLearnings = 0;
  let deletedFuzzHabits = 0;
  const tx = db.transaction(() => {
    // a. Purger les pollués globaux (hotel/restaurant via search_web/external_redirect)
    const r1 = db
      .prepare(
        `DELETE FROM route_learnings
         WHERE (intent = 'hotel' OR intent = 'restaurant')
           AND (tool_chain LIKE '%search_web%' OR tool_chain LIKE '%external_redirect%')`
      )
      .run();
    deletedPolluted = r1.changes;

    // b. Purger TOUS les learnings + habits du user fuzz-bot
    if (fuzzUser) {
      const r2 = db
        .prepare('DELETE FROM route_learnings WHERE user_id = ?')
        .run(fuzzUser.id);
      deletedFuzzLearnings = r2.changes;
      const r3 = db
        .prepare('DELETE FROM user_habits WHERE user_id = ?')
        .run(fuzzUser.id);
      deletedFuzzHabits = r3.changes;
    }
  });
  tx();

  console.log(`  -${deletedPolluted} route_learnings pollués (hotel/restaurant via search_web/external_redirect)`);
  console.log(`  -${deletedFuzzLearnings} route_learnings restants du user fuzz-bot`);
  console.log(`  -${deletedFuzzHabits} user_habits du user fuzz-bot`);
  console.log(`  user fuzz-bot CONSERVÉ (Pascal veut pouvoir re-fuzzer).`);

  // 3. Re-check
  header('Vérification post-purge');
  const polluted2 = db
    .prepare(
      `SELECT COUNT(*) AS c FROM route_learnings
       WHERE (intent = 'hotel' OR intent = 'restaurant')
         AND (tool_chain LIKE '%search_web%' OR tool_chain LIKE '%external_redirect%')`
    )
    .get().c;
  console.log(`  route_learnings pollués restants : ${polluted2}`);
  db.close();
  console.log('\n[purge] terminé.');
}

main();
