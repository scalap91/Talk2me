#!/usr/bin/env node
/**
 * Talk2Me #409 — Feature Registry Runner (Pascal 2026-06-05).
 *
 * Doctrines :
 *  [[feedback-watchdog-pipeline]] : aboie Telegram sur régression
 *  [[feedback-fuzz-rapport-obligatoire]] : rapport MD + JSON + INDEX
 *  [[feedback-modular-no-scattered-patches]] : 1 module, pas de scotch
 *
 * Usage :
 *   node tests/feature-registry/runner.mjs                    # tous les checks
 *   node tests/feature-registry/runner.mjs --feature=foo      # un seul check
 *   node tests/feature-registry/runner.mjs --module=chess     # module
 *   node tests/feature-registry/runner.mjs --cron             # mode cron loop
 *   node tests/feature-registry/runner.mjs --once             # un run et exit
 *   node tests/feature-registry/runner.mjs --quiet            # logs minimaux
 *   node tests/feature-registry/runner.mjs --no-telegram      # désactive notifs
 *   node tests/feature-registry/runner.mjs --trigger=deploy   # tag le run
 */

import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  appendFileSync,
  statSync,
} from 'node:fs';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
// IMPORTANT : doit pointer sur la MÊME DB que /lib/db.ts (Pascal #401 monolithique).
// /lib/db.ts utilise DB_PATH = '/home/ubuntu/talktome/data/talktome.db'.
// Sinon le runner crée une DB orpheline et ne voit pas les vraies tables.
const DB_PATH = process.env.FEATURE_REGISTRY_DB_PATH || path.join(REPO_ROOT, 'data', 'talktome.db');
const REGISTRY_PATH = path.join(__dirname, 'registry.json');
const CHECKS_DIR = path.join(__dirname, 'checks');
const REPORTS_DIR = path.join(REPO_ROOT, 'reports', 'feature-registry');
const INDEX_PATH = path.join(REPORTS_DIR, 'INDEX.md');
const TG_SEND_PATH = '/home/ubuntu/tg-bridge/tg-send';

if (!existsSync(REPORTS_DIR)) mkdirSync(REPORTS_DIR, { recursive: true });

// === Charge .env.local pour TALKTOME_INTERNAL_BASE_URL, FEATURE_REGISTRY_TG, etc. ===
try {
  const envPath = path.join(REPO_ROOT, '.env.local');
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      const [, k, vRaw] = m;
      if (process.env[k] !== undefined) continue;
      let v = vRaw;
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      process.env[k] = v;
    }
  }
} catch {}

// === Args ===
const args = process.argv.slice(2);
function argVal(name) {
  const f = args.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!f) return null;
  if (f === `--${name}`) return true;
  return f.split('=').slice(1).join('=');
}
const ARG_FEATURE = argVal('feature');
const ARG_MODULE = argVal('module');
const ARG_CRON = argVal('cron');
const ARG_ONCE = argVal('once');
const ARG_QUIET = argVal('quiet') === true;
const ARG_NO_TG = argVal('no-telegram') === true;
const ARG_TRIGGER = (argVal('trigger') || (ARG_CRON ? 'cron' : 'manual')).toString();
const ARG_INTERVAL_MIN = Number(argVal('interval-min')) || 60;
const ARG_LIST = argVal('list') === true;
const ARG_LIST_BROKEN = argVal('broken') === true;

function log(...a) { if (!ARG_QUIET) console.log('[feature-registry]', ...a); }
function logErr(...a) { console.error('[feature-registry]', ...a); }

// === Telegram ===
function notifyTelegram(msg) {
  if (ARG_NO_TG) { log('TG SKIP (--no-telegram) ⇒', msg.split('\n')[0]); return; }
  if (!existsSync(TG_SEND_PATH)) { log('TG LOG-ONLY ⇒', msg.split('\n')[0]); return; }
  try {
    const child = spawn(TG_SEND_PATH, [msg], { detached: true, stdio: 'ignore' });
    child.unref();
  } catch (e) { logErr('tg-send failed:', e?.message); }
}

// === DB ===
function openDb() {
  if (!existsSync(DB_PATH)) {
    logErr('FATAL: talktome.db introuvable à', DB_PATH);
    process.exit(2);
  }
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
  // Vérifie que la table existe (initialisée par le Next runtime via /lib/db.ts).
  // Si elle n'existe pas encore, on la crée à la volée (même schéma).
  db.exec(`
    CREATE TABLE IF NOT EXISTS feature_registry (
      id TEXT PRIMARY KEY,
      module TEXT NOT NULL,
      feature_name TEXT NOT NULL,
      description TEXT,
      added_at INTEGER NOT NULL,
      added_in_task TEXT,
      test_path TEXT,
      last_pass_at INTEGER,
      last_fail_at INTEGER,
      last_fail_reason TEXT,
      consecutive_fails INTEGER DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'live'
    );
    CREATE INDEX IF NOT EXISTS idx_fr_module ON feature_registry(module);
    CREATE INDEX IF NOT EXISTS idx_fr_status ON feature_registry(status);
    CREATE TABLE IF NOT EXISTS feature_test_runs (
      id TEXT PRIMARY KEY,
      run_at INTEGER NOT NULL,
      ended_at INTEGER,
      total INTEGER, passed INTEGER, failed INTEGER, flaky INTEGER,
      duration_ms INTEGER,
      report_path TEXT,
      trigger TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_ftruns_run_at ON feature_test_runs(run_at DESC);
    CREATE TABLE IF NOT EXISTS feature_test_results (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      feature_id TEXT NOT NULL,
      passed INTEGER NOT NULL,
      duration_ms INTEGER,
      error_message TEXT,
      evidence TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_ftr_run ON feature_test_results(run_id);
    CREATE INDEX IF NOT EXISTS idx_ftr_feature ON feature_test_results(feature_id);
  `);
  return db;
}

// === Sync registry.json → feature_registry ===
function syncRegistry(db) {
  const raw = JSON.parse(readFileSync(REGISTRY_PATH, 'utf8'));
  const declared = raw.features || [];
  const now = Date.now();
  const upsert = db.prepare(`
    INSERT INTO feature_registry (id, module, feature_name, description, added_at, added_in_task, status)
    VALUES (?, ?, ?, ?, ?, ?, 'pending_test')
    ON CONFLICT(id) DO UPDATE SET
      module=excluded.module,
      feature_name=excluded.feature_name,
      description=COALESCE(excluded.description, feature_registry.description),
      added_in_task=COALESCE(excluded.added_in_task, feature_registry.added_in_task)
  `);
  const tx = db.transaction(() => {
    for (const f of declared) {
      upsert.run(f.id, f.module, f.name, f.description || null, now, f.added_in_task || null);
    }
  });
  tx();
  return declared;
}

// === Chargement des checks ===
async function loadAllChecks() {
  const files = readdirSync(CHECKS_DIR).filter((f) => f.endsWith('.mjs'));
  const all = [];
  for (const f of files.sort()) {
    const mod = await import(pathToFileURL(path.join(CHECKS_DIR, f)).href);
    const checks = mod.CHECKS || (mod.FEATURE && mod.run ? [{ FEATURE: mod.FEATURE, run: mod.run }] : []);
    for (const c of checks) {
      if (!c?.FEATURE?.id || typeof c.run !== 'function') continue;
      all.push({ ...c, _file: f });
    }
  }
  return all;
}

// === Update status logique ===
function recomputeStatus(prevStatus, prevConsecutiveFails, passed) {
  if (passed) return { status: 'live', consecutive_fails: 0 };
  const cf = (prevConsecutiveFails || 0) + 1;
  if (cf >= 3) return { status: 'broken', consecutive_fails: cf };
  if (prevStatus === 'live' || prevStatus === 'pending_test') return { status: 'flaky', consecutive_fails: cf };
  return { status: prevStatus === 'broken' ? 'broken' : 'flaky', consecutive_fails: cf };
}

// === Liste mode ===
function listFeaturesMode(db, broken = false) {
  const rows = db.prepare(
    broken
      ? "SELECT * FROM feature_registry WHERE status IN ('broken','flaky') ORDER BY module ASC, id ASC"
      : 'SELECT * FROM feature_registry ORDER BY module ASC, id ASC',
  ).all();
  if (rows.length === 0) {
    console.log('(aucune feature)');
    return;
  }
  const byMod = new Map();
  for (const r of rows) {
    if (!byMod.has(r.module)) byMod.set(r.module, []);
    byMod.get(r.module).push(r);
  }
  for (const [mod, list] of byMod.entries()) {
    const live = list.filter((r) => r.status === 'live').length;
    const total = list.length;
    const pct = total ? Math.round((live / total) * 100) : 0;
    console.log(`\n[ ${mod} ] ${live}/${total} (${pct}%)`);
    for (const r of list) {
      const mark =
        r.status === 'live' ? 'OK' :
        r.status === 'broken' ? 'KO' :
        r.status === 'flaky' ? 'F?' :
        r.status === 'pending_test' ? '..' : '~~';
      const tail = r.last_fail_reason ? ` — ${r.last_fail_reason.slice(0, 80)}` : '';
      console.log(`  [${mark}] ${r.id}  ${r.feature_name}${tail}`);
    }
  }
}

// === Run principal ===
async function runOnce({ trigger }) {
  const db = openDb();
  const declared = syncRegistry(db);
  log(`registry sync : ${declared.length} features déclarées`);

  let checks = await loadAllChecks();
  if (ARG_FEATURE) checks = checks.filter((c) => c.FEATURE.id === ARG_FEATURE);
  if (ARG_MODULE) {
    const featuresInModule = new Set(declared.filter((f) => f.module === ARG_MODULE).map((f) => f.id));
    checks = checks.filter((c) => featuresInModule.has(c.FEATURE.id));
  }
  log(`${checks.length} checks à exécuter`);

  const runId = randomUUID();
  const runStart = Date.now();
  db.prepare(
    `INSERT INTO feature_test_runs (id, run_at, total, trigger) VALUES (?, ?, ?, ?)`,
  ).run(runId, runStart, checks.length, trigger);

  const insertResult = db.prepare(
    `INSERT INTO feature_test_results (id, run_id, feature_id, passed, duration_ms, error_message, evidence)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  const getFeature = db.prepare('SELECT status, consecutive_fails FROM feature_registry WHERE id = ?');
  const updateFeaturePass = db.prepare(`UPDATE feature_registry SET last_pass_at=?, consecutive_fails=0, status='live', last_fail_reason=NULL WHERE id=?`);
  const updateFeatureFail = db.prepare(`UPDATE feature_registry SET last_fail_at=?, last_fail_reason=?, consecutive_fails=?, status=? WHERE id=?`);

  const ctx = {
    fetchUrl: process.env.TALKTOME_INTERNAL_BASE_URL || `http://127.0.0.1:${process.env.PORT || '3010'}`,
  };

  // Détection des transitions (live → fail) pour notif Telegram
  const newlyBroken = [];
  const newlyLive = [];

  // Parallélisation par batches de 8 pour rester sous le timeout par check
  const BATCH = 8;
  let passed = 0, failed = 0, flaky = 0;
  for (let i = 0; i < checks.length; i += BATCH) {
    const batch = checks.slice(i, i + BATCH);
    const results = await Promise.all(
      batch.map(async (c) => {
        const t0 = Date.now();
        try {
          const r = await c.run(ctx);
          return { check: c, ...r, duration_ms: r?.duration_ms ?? Date.now() - t0 };
        } catch (e) {
          return { check: c, passed: false, duration_ms: Date.now() - t0, error: `runner-exception: ${e?.message || e}` };
        }
      }),
    );

    const tx = db.transaction((items) => {
      for (const it of items) {
        const fid = it.check.FEATURE.id;
        const prior = getFeature.get(fid) || { status: 'pending_test', consecutive_fails: 0 };
        const evidence = it.evidence ? JSON.stringify(it.evidence).slice(0, 4000) : null;
        insertResult.run(
          randomUUID(), runId, fid, it.passed ? 1 : 0,
          Math.round(it.duration_ms || 0), it.error || null, evidence,
        );
        if (it.passed) {
          passed++;
          updateFeaturePass.run(Date.now(), fid);
          if (prior.status === 'broken') newlyLive.push({ id: fid });
        } else {
          failed++;
          const next = recomputeStatus(prior.status, prior.consecutive_fails, false);
          if (next.status === 'flaky') flaky++;
          updateFeatureFail.run(Date.now(), (it.error || 'unknown').slice(0, 500), next.consecutive_fails, next.status, fid);
          if (prior.status === 'live' || prior.status === 'pending_test') {
            newlyBroken.push({ id: fid, reason: it.error, cf: next.consecutive_fails, status: next.status });
          }
        }
      }
    });
    tx(results);

    if (!ARG_QUIET) {
      for (const it of results) {
        const mark = it.passed ? 'OK' : 'KO';
        const err = it.passed ? '' : ` — ${(it.error || '').slice(0, 80)}`;
        log(`  [${mark}] ${it.check.FEATURE.id} (${it.duration_ms}ms)${err}`);
      }
    }
  }

  const runEnd = Date.now();
  const totalDur = runEnd - runStart;

  // ===== Rapport MD + JSON =====
  const stamp = new Date(runStart).toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const reportMdPath = path.join(REPORTS_DIR, `run_${stamp}.md`);
  const reportJsonPath = path.join(REPORTS_DIR, `run_${stamp}.json`);

  // Recalcule santé par module
  const moduleHealth = db.prepare(`
    SELECT module, status, COUNT(*) as n FROM feature_registry GROUP BY module, status
  `).all();
  const byMod = new Map();
  for (const r of moduleHealth) {
    const m = byMod.get(r.module) || { module: r.module, live: 0, broken: 0, flaky: 0, pending: 0, deprecated: 0, total: 0 };
    if (r.status === 'live') m.live = r.n;
    else if (r.status === 'broken') m.broken = r.n;
    else if (r.status === 'flaky') m.flaky = r.n;
    else if (r.status === 'pending_test') m.pending = r.n;
    else if (r.status === 'deprecated') m.deprecated = r.n;
    m.total += r.n;
    byMod.set(r.module, m);
  }
  const moduleSummary = Array.from(byMod.values()).sort((a, b) => a.module.localeCompare(b.module));
  const globalLive = moduleSummary.reduce((s, m) => s + m.live, 0);
  const globalTotal = moduleSummary.reduce((s, m) => s + (m.total - m.deprecated), 0);

  const md = [];
  md.push(`# Talk2Me Feature Registry — Run ${stamp}`);
  md.push('');
  md.push(`- Trigger : \`${trigger}\``);
  md.push(`- Total checks : ${checks.length}`);
  md.push(`- Passed : **${passed}**`);
  md.push(`- Failed : **${failed}**`);
  md.push(`- Flaky (transition) : ${flaky}`);
  md.push(`- Durée : ${totalDur}ms`);
  md.push(`- Health globale : ${globalLive}/${globalTotal} features live (${globalTotal ? Math.round((globalLive / globalTotal) * 100) : 0}%)`);
  md.push('');
  md.push('## Santé par module');
  md.push('');
  md.push('| Module | Live | Broken | Flaky | Pending | Total | % |');
  md.push('|---|---:|---:|---:|---:|---:|---:|');
  for (const m of moduleSummary) {
    const denom = m.total - m.deprecated;
    const pct = denom ? Math.round((m.live / denom) * 100) : 0;
    md.push(`| ${m.module} | ${m.live} | ${m.broken} | ${m.flaky} | ${m.pending} | ${denom} | ${pct}% |`);
  }
  md.push('');
  const failedRows = db.prepare(`
    SELECT r.feature_id, r.error_message, f.module, f.feature_name, f.status as feature_status
    FROM feature_test_results r
    LEFT JOIN feature_registry f ON f.id = r.feature_id
    WHERE r.run_id = ? AND r.passed = 0 ORDER BY f.module
  `).all(runId);
  if (failedRows.length) {
    md.push('## Failures ce run');
    md.push('');
    for (const f of failedRows) {
      md.push(`- **[${f.module}] ${f.feature_id}** _(${f.feature_status})_ — ${f.feature_name}`);
      md.push(`  - ${(f.error_message || 'n/a').slice(0, 300)}`);
    }
  } else {
    md.push('## Failures');
    md.push('');
    md.push('Aucune. Tous les checks passent.');
  }
  md.push('');
  md.push('---');
  md.push(`_Généré par /tests/feature-registry/runner.mjs — Pascal #409 — ${new Date().toISOString()}_`);
  writeFileSync(reportMdPath, md.join('\n'));
  writeFileSync(reportJsonPath, JSON.stringify({
    run_id: runId, run_at: runStart, ended_at: runEnd, total: checks.length,
    passed, failed, flaky, duration_ms: totalDur, trigger,
    module_health: moduleSummary,
    failed_features: failedRows.map((f) => ({ id: f.feature_id, module: f.module, error: f.error_message })),
    newly_broken: newlyBroken, newly_live: newlyLive,
  }, null, 2));

  // Update run row
  db.prepare(`UPDATE feature_test_runs SET ended_at=?, passed=?, failed=?, flaky=?, duration_ms=?, report_path=? WHERE id=?`)
    .run(runEnd, passed, failed, flaky, totalDur, reportMdPath, runId);

  // INDEX.md
  if (!existsSync(INDEX_PATH)) {
    writeFileSync(INDEX_PATH, '# Talk2Me Feature Registry — INDEX\n\n| run_id | stamp | trigger | passed | failed | health |\n|---|---|---|---:|---:|---|\n');
  }
  appendFileSync(INDEX_PATH,
    `| ${runId.slice(0, 8)} | ${stamp} | ${trigger} | ${passed} | ${failed} | ${globalLive}/${globalTotal} |\n`,
  );

  // ===== Telegram =====
  if (newlyBroken.length > 0) {
    const msg = [
      `🚨 Talk2Me Feature Registry — RÉGRESSION`,
      ``,
      `${newlyBroken.length} feature(s) qui passai(en)t cassent maintenant :`,
      ...newlyBroken.slice(0, 8).map((b) => `• ${b.id}${b.status === 'broken' ? ' [BROKEN]' : ' [flaky]'} — ${(b.reason || '').slice(0, 120)}`),
      ``,
      `Run : ${stamp}`,
      `Rapport : ${reportMdPath}`,
      `Dashboard : talk2me.fr/schema/features`,
    ].join('\n');
    notifyTelegram(msg);
  } else if (newlyLive.length > 0 && trigger !== 'manual') {
    notifyTelegram(`✅ Talk2Me Feature Registry — ${newlyLive.length} feature(s) restaurée(s) : ${newlyLive.slice(0, 5).map((x) => x.id).join(', ')}`);
  } else if (trigger === 'cron') {
    // Digest synthétique (1 ligne par module)
    const lines = [`📊 Talk2Me Feature Registry — Run cron`, '', `Health : ${globalLive}/${globalTotal} (${globalTotal ? Math.round(globalLive / globalTotal * 100) : 0}%)`, ''];
    for (const m of moduleSummary) {
      const denom = m.total - m.deprecated;
      if (denom === 0) continue;
      const tag = m.broken > 0 ? '🚨' : m.flaky > 0 ? '⚠️' : '✓';
      lines.push(`${tag} ${m.module} : ${m.live}/${denom}`);
    }
    // On n'envoie le digest qu'une fois par jour : check sur l'heure de Paris ~9h
    const hour = new Date().getHours();
    if (hour === 9 && new Date().getMinutes() < 15) {
      notifyTelegram(lines.join('\n'));
    }
  }

  log(`Done. passed=${passed} failed=${failed} flaky=${flaky} dur=${totalDur}ms report=${reportMdPath}`);

  db.close();
  return { runId, passed, failed, flaky, totalDur, reportMdPath, newlyBroken, newlyLive, globalLive, globalTotal };
}

// === Entrypoint ===
async function main() {
  if (ARG_LIST || ARG_LIST_BROKEN) {
    const db = openDb();
    syncRegistry(db);
    listFeaturesMode(db, ARG_LIST_BROKEN);
    db.close();
    return;
  }
  if (ARG_CRON) {
    log(`cron mode — interval=${ARG_INTERVAL_MIN}min`);
    // Premier run immédiat
    await runOnce({ trigger: 'cron' }).catch((e) => logErr('run failed:', e));
    setInterval(async () => {
      try { await runOnce({ trigger: 'cron' }); } catch (e) { logErr('run failed:', e); }
    }, Math.max(1, ARG_INTERVAL_MIN) * 60 * 1000);
    return;
  }
  await runOnce({ trigger: ARG_TRIGGER });
}

main().catch((e) => {
  logErr('FATAL', e);
  process.exit(1);
});
