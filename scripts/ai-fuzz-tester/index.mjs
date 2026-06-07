#!/usr/bin/env node
/**
 * Talk2Me AI Fuzz Tester #405 — CLI entry (Pascal 2026-06-05).
 *
 * Usage :
 *   node scripts/ai-fuzz-tester/index.mjs --profiles=all --count=100
 *   node scripts/ai-fuzz-tester/index.mjs --profile=limites --count=50
 *   node scripts/ai-fuzz-tester/index.mjs --regression       # rejoue tous les bugs ouverts
 *   node scripts/ai-fuzz-tester/index.mjs --list-bugs        # liste les bugs ouverts
 *   node scripts/ai-fuzz-tester/index.mjs --cleanup          # purge users fuzz
 *
 * Options :
 *   --rate=<ms>         rate limit entre prompts (défaut 200, env FUZZ_RATE_LIMIT_MS)
 *   --base=<url>        base URL (défaut http://127.0.0.1:3010, env FUZZ_BASE_URL)
 *   --timeout=<ms>      timeout par prompt (défaut 45000)
 *
 * Doctrines respectées :
 *  - [[feedback-fuzz-rapport-obligatoire]] : rapport + compteurs side effects
 *  - [[feedback-emails-test-blocklist]] : emails fuzz+*@test.com seulement
 *  - [[talk2me-pii-air-gap]] : profile limites probe PII, jamais inventer
 *  - [[talktome-produit-abouti]] : 9 profiles + 7 validators (pas un MVP)
 */

import { novice } from './profiles/novice.mjs';
import { presse } from './profiles/presse.mjs';
import { fautes } from './profiles/fautes.mjs';
import { abrege } from './profiles/abrege.mjs';
import { hotels } from './profiles/hotels.mjs';
import { musique } from './profiles/musique.mjs';
import { voyage } from './profiles/voyage.mjs';
import { business } from './profiles/business.mjs';
import { limites } from './profiles/limites.mjs';

import { runProfile } from './runner.mjs';
import { generateReport } from './reporter.mjs';
import {
  createRun, finalizeRun, listOpenBugs, listAllBugs,
} from './regression-db.mjs';
import Database from 'better-sqlite3';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.resolve(__dirname, '../../data/talktome.db');

const ALL_PROFILES = {
  novice, presse, fautes, abrege, hotels, musique, voyage, business, limites,
};

function parseArgs(argv) {
  const out = { profiles: null, count: 10, rate: null, base: null, timeout: 45000, regression: false, listBugs: false, cleanup: false };
  for (const a of argv) {
    if (a === '--regression' || a === '--reg') out.regression = true;
    else if (a === '--list-bugs') out.listBugs = true;
    else if (a === '--cleanup') out.cleanup = true;
    else if (a.startsWith('--profiles=')) out.profiles = a.slice('--profiles='.length).split(',');
    else if (a.startsWith('--profile=')) out.profiles = [a.slice('--profile='.length)];
    else if (a.startsWith('--count=')) out.count = parseInt(a.slice('--count='.length), 10);
    else if (a.startsWith('--rate=')) out.rate = parseInt(a.slice('--rate='.length), 10);
    else if (a.startsWith('--base=')) out.base = a.slice('--base='.length);
    else if (a.startsWith('--timeout=')) out.timeout = parseInt(a.slice('--timeout='.length), 10);
  }
  return out;
}

function resolveProfiles(spec) {
  if (!spec || spec.length === 0 || spec.includes('all')) return Object.values(ALL_PROFILES);
  const out = [];
  for (const name of spec) {
    if (ALL_PROFILES[name]) out.push(ALL_PROFILES[name]);
    else console.warn(`[fuzz] profile inconnu : ${name}`);
  }
  return out;
}

async function cmdListBugs() {
  const bugs = listOpenBugs(50);
  console.log(`\n${bugs.length} bugs ouverts dans fuzz_regression :\n`);
  if (bugs.length === 0) {
    console.log('  (aucun)');
    return;
  }
  for (const b of bugs) {
    console.log(`  [×${b.fail_count}] ${b.profile} :: "${b.prompt.slice(0, 60)}"`);
    console.log(`     ${b.last_fail_reason?.slice(0, 200) || ''}`);
    console.log(`     last_fail_at=${new Date(b.last_fail_at).toISOString()}\n`);
  }
}

async function cmdCleanup() {
  const db = new Database(DB_PATH);
  db.pragma('foreign_keys = ON');
  const fuzz = db.prepare("SELECT id, username FROM users WHERE username LIKE 'fuzz-%'").all();
  console.log(`Found ${fuzz.length} fuzz users.`);
  if (fuzz.length === 0) return;
  let convCount = 0, msgCount = 0;
  const tx = db.transaction(() => {
    for (const u of fuzz) {
      const convs = db.prepare('SELECT id FROM conversations WHERE user_id = ? OR created_by = ?').all(u.id, u.id);
      for (const c of convs) {
        const r = db.prepare('DELETE FROM messages WHERE conversation_id = ?').run(c.id);
        msgCount += r.changes;
        db.prepare('DELETE FROM conversation_participants WHERE conversation_id = ?').run(c.id);
        db.prepare('DELETE FROM conversations WHERE id = ?').run(c.id);
        convCount++;
      }
      db.prepare('DELETE FROM sessions WHERE user_id = ?').run(u.id);
      db.prepare('DELETE FROM ai_memories WHERE user_id = ?').run(u.id);
      try { db.prepare('DELETE FROM user_habits WHERE user_id = ?').run(u.id); } catch {}
      try { db.prepare('DELETE FROM route_learnings WHERE user_id = ?').run(u.id); } catch {}
      try { db.prepare('DELETE FROM saved_cards WHERE user_id = ?').run(u.id); } catch {}
      try { db.prepare('DELETE FROM card_drafts WHERE user_id = ?').run(u.id); } catch {}
      try { db.prepare('DELETE FROM friendships WHERE user_a = ? OR user_b = ?').run(u.id, u.id); } catch {}
      db.prepare('DELETE FROM users WHERE id = ?').run(u.id);
    }
  });
  tx();
  console.log(`Cleanup: ${fuzz.length} users, ${convCount} convs, ${msgCount} messages.`);
  db.close();
}

async function cmdRegression(options) {
  const bugs = listAllBugs(1000);
  if (bugs.length === 0) {
    console.log('No bugs in DB to re-run.');
    return;
  }
  // Construire des prompts virtuels à partir des bugs DB groupés par profile
  const grouped = new Map();
  for (const b of bugs) {
    if (!grouped.has(b.profile)) grouped.set(b.profile, []);
    let forbidden = [], required = [];
    try { forbidden = JSON.parse(b.forbidden_patterns || '[]'); } catch {}
    try { required = JSON.parse(b.required_patterns || '[]'); } catch {}
    grouped.get(b.profile).push({
      text: b.prompt,
      expected_intent: b.expected_intent,
      expected_tool: b.expected_tool,
      expected_card_kind: b.expected_card_kind,
      forbidden_patterns: forbidden,
      required_patterns: required,
      mode: 'chat',
      skip_validators: [],
    });
  }
  console.log(`Regression: ${bugs.length} bugs across ${grouped.size} profiles.`);
  const fakeProfiles = [];
  for (const [name, prompts] of grouped.entries()) {
    const known = ALL_PROFILES[name];
    fakeProfiles.push({
      name,
      description: `Regression de ${prompts.length} bugs ${name} (auto)`,
      generate: () => prompts,
    });
  }
  await runFuzz(fakeProfiles, options, { regression: true, count: null });
}

async function runFuzz(profiles, options, meta) {
  const rateLimit = options.rate ?? (parseInt(process.env.FUZZ_RATE_LIMIT_MS || '200', 10));
  const baseUrl = options.base ?? (process.env.FUZZ_BASE_URL || 'http://127.0.0.1:3010');
  const runId = createRun({
    profiles: profiles.map((p) => p.name),
    rateLimit,
  });
  const startedAt = Date.now();
  console.log(`\n=== Talk2Me Fuzz Run ===`);
  console.log(`  run_id     : ${runId}`);
  console.log(`  profiles   : ${profiles.map((p) => p.name).join(', ')}`);
  console.log(`  count      : ${meta.regression ? 'regression mode' : meta.count}`);
  console.log(`  rate_limit : ${rateLimit}ms`);
  console.log(`  base       : ${baseUrl}`);
  console.log(`  mode       : ${meta.regression ? 'REGRESSION' : 'FRESH'}`);
  console.log('');

  const profilesData = [];
  let totalMessagesCreated = 0;
  let totalHttpErrors = 0;
  let totalThirdParty = 0;
  const fuzzUserIds = [];

  for (const profile of profiles) {
    process.stdout.write(`[${profile.name}] `);
    const pd = await runProfile({
      profile,
      count: meta.regression ? profile.generate().length : meta.count,
      baseUrl,
      rateLimitMs: rateLimit,
      onProgress: ({ idx, total, pass, fail }) => {
        if (idx % 5 === 0 || idx === total) {
          process.stdout.write(`${idx}/${total} (pass=${pass} fail=${fail}) `);
        }
      },
    });
    process.stdout.write('\n');
    profilesData.push(pd);
    totalMessagesCreated += pd.messagesCreated;
    totalHttpErrors += pd.httpErrors;
    // Estimation appels API tiers : 1 DeepSeek/prompt + ~0.5 tool/prompt
    totalThirdParty += pd.total * 2;
    fuzzUserIds.push(pd.user_id);
  }
  const durationMs = Date.now() - startedAt;
  const sideEffects = {
    messagesCreated: totalMessagesCreated,
    fuzzUserIds,
    emailsSent: 0, // blocklist Brevo bloque tout +fuzz/@test.com
    httpErrors: totalHttpErrors,
    thirdPartyCalls: totalThirdParty,
  };
  let total = 0, pass = 0, fail = 0;
  for (const p of profilesData) { total += p.total; pass += p.pass; fail += p.fail; }

  const reportPath = generateReport({ runId, profilesData, options: { rateLimitMs: rateLimit, baseUrl }, sideEffects, durationMs });
  finalizeRun(runId, { total, pass, fail, reportPath, sideEffects });

  console.log(`\n=== Résumé ===`);
  console.log(`  total       : ${total}`);
  console.log(`  pass        : ${pass} (${total > 0 ? Math.round(pass / total * 100) : 0}%)`);
  console.log(`  fail        : ${fail}`);
  console.log(`  duration    : ${(durationMs / 1000).toFixed(1)}s`);
  console.log(`  side-effects: messages=${totalMessagesCreated} http_err=${totalHttpErrors} emails=0 (blocklist)`);
  console.log(`  rapport     : ${reportPath}`);
  console.log(`  run_id      : ${runId}`);
  console.log('');
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.listBugs) return cmdListBugs();
  if (opts.cleanup) return cmdCleanup();
  if (opts.regression) return cmdRegression(opts);

  const profiles = resolveProfiles(opts.profiles);
  if (profiles.length === 0) {
    console.error('Aucun profile valide. Usage : --profiles=all|<name1>,<name2>');
    process.exit(1);
  }
  await runFuzz(profiles, opts, { count: opts.count });
}

main().catch((e) => {
  console.error('[fuzz] fatal :', e);
  process.exit(1);
});
