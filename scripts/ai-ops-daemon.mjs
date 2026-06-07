#!/usr/bin/env node
/**
 * Talk2Me #406+#407 — AI Ops Daemon (Pascal 2026-06-05).
 *
 * Process H24 (PM2 ou cron) qui orchestre le Red Team Pipeline.
 *
 * Architecture : le daemon est un client HTTP pur qui POST sur
 * /api/admin/ai-ops/run-once à chaque cycle. Tout le code TypeScript du
 * pipeline (Generator/Critic/Fix/Judge) vit dans le process Next.js
 * (talktome PM2) — ça évite les soucis d'aliases @/ + lib partagés.
 *
 * Default : 10 cycles/h (Pascal #406) → INTERVAL_MS = 360_000.
 * Coût estimé : ~$30/mois en mode éco.
 *
 * Modes :
 *  AI_OPS_DRY_RUN=true   → pas de Telegram réel (log only)
 *  AI_OPS_MAX_CYCLES=N   → arrête après N cycles (mode test)
 *
 * Doctrines :
 *  [[feedback-fuzz-rapport-obligatoire]] : rapport JSON + INDEX.md auto
 *  [[feedback-watchdog-pipeline]] : aboie Telegram si 5 erreurs consécutives
 *  [[project-bizzi-no-funding]] : default 10 cycles/h
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync, existsSync, appendFileSync } from 'node:fs';
import { spawn } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

// Charge .env.local manuellement (sans dépendre de dotenv).
try {
  const { readFileSync } = await import('node:fs');
  const envPath = path.join(REPO_ROOT, '.env.local');
  if (existsSync(envPath)) {
    const raw = readFileSync(envPath, 'utf8');
    for (const line of raw.split('\n')) {
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
} catch (e) {
  console.warn('[ai-ops-daemon] .env.local load skipped:', e?.message);
}

const CYCLES_PER_HOUR = Math.max(
  1,
  Math.min(120, Number(process.env.AI_OPS_CYCLES_PER_HOUR) || 10),
);
const INTERVAL_MS = Math.round((3600 / CYCLES_PER_HOUR) * 1000);
const MAX_CYCLES = Number(process.env.AI_OPS_MAX_CYCLES) || 0;
const DRY_RUN =
  process.env.AI_OPS_DRY_RUN === 'true' || process.env.AI_OPS_DRY_RUN === '1';
const BASE_URL =
  process.env.TALKTOME_INTERNAL_BASE_URL ||
  `http://127.0.0.1:${process.env.PORT || '3010'}`;
const DAEMON_TOKEN = process.env.AI_OPS_DAEMON_TOKEN || 'dev-token-change-me';

const REPORTS_DIR = path.join(REPO_ROOT, 'reports', 'ai-ops');
if (!existsSync(REPORTS_DIR)) mkdirSync(REPORTS_DIR, { recursive: true });
const INDEX_PATH = path.join(REPORTS_DIR, 'INDEX.md');

const runId = new Date().toISOString().replace(/[:.]/g, '-');
const reportPath = path.join(REPORTS_DIR, `daemon_${runId}.json`);
const startedAt = Date.now();

const sideEffects = {
  cycles_total: 0,
  cycles_ok: 0,
  cycles_failed: 0,
  bugs_detected: 0,
  bugs_critical: 0,
  deepseek_calls_estimated: 0,
  consecutive_errors: 0,
};

console.log(`[ai-ops-daemon] start :
 BASE_URL=${BASE_URL}
 CYCLES_PER_HOUR=${CYCLES_PER_HOUR} (interval=${INTERVAL_MS}ms)
 MAX_CYCLES=${MAX_CYCLES || 'infinite'}
 DRY_RUN=${DRY_RUN}
 REPORT=${reportPath}`);

const TG_SEND_PATH = '/home/ubuntu/tg-bridge/tg-send';
function notifyTelegram(msg) {
  if (DRY_RUN) {
    console.log('[ai-ops-daemon] TG DRY_RUN ⇒', msg.split('\n')[0]);
    return;
  }
  if (!existsSync(TG_SEND_PATH)) {
    console.log('[ai-ops-daemon] TG LOG-ONLY ⇒', msg.split('\n')[0]);
    return;
  }
  try {
    const child = spawn(TG_SEND_PATH, [msg], { detached: true, stdio: 'ignore' });
    child.unref();
  } catch (e) {
    console.warn('[ai-ops-daemon] tg-send spawn failed:', e?.message);
  }
}

async function callRunOnce() {
  const ctl = new AbortController();
  const to = setTimeout(() => ctl.abort(), 90_000);
  try {
    const r = await fetch(`${BASE_URL}/api/admin/ai-ops/run-once`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-ai-ops-daemon-token': DAEMON_TOKEN,
      },
      body: JSON.stringify({ dry_run: DRY_RUN }),
      signal: ctl.signal,
    });
    const txt = await r.text();
    let body = null;
    try { body = JSON.parse(txt); } catch { body = { raw: txt }; }
    if (!r.ok) {
      return { ok: false, error: `HTTP ${r.status}: ${(body?.error || txt).toString().slice(0, 200)}` };
    }
    return body;
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  } finally {
    clearTimeout(to);
  }
}

function writeReport(finalize = false) {
  const data = {
    run_id: runId,
    started_at: new Date(startedAt).toISOString(),
    last_updated: new Date().toISOString(),
    config: {
      cycles_per_hour: CYCLES_PER_HOUR,
      interval_ms: INTERVAL_MS,
      max_cycles: MAX_CYCLES,
      dry_run: DRY_RUN,
      base_url: BASE_URL,
    },
    side_effects: sideEffects,
    finalized: finalize,
  };
  try {
    writeFileSync(reportPath, JSON.stringify(data, null, 2));
  } catch (e) {
    console.warn('[ai-ops-daemon] cannot write report:', e?.message);
  }
  if (finalize) {
    const line =
      `| ${runId} | cycles=${sideEffects.cycles_total} ok=${sideEffects.cycles_ok} fail=${sideEffects.cycles_failed} bugs=${sideEffects.bugs_detected} crit=${sideEffects.bugs_critical} dry=${DRY_RUN} |\n`;
    try {
      if (!existsSync(INDEX_PATH)) {
        writeFileSync(
          INDEX_PATH,
          '# Talk2Me AI Ops daemon — INDEX\n\n| run_id | stats |\n|---|---|\n',
        );
      }
      appendFileSync(INDEX_PATH, line);
    } catch {}
  }
}

let stopping = false;
function stop(reason) {
  if (stopping) return;
  stopping = true;
  console.log(`[ai-ops-daemon] stop (${reason})`);
  writeReport(true);
  process.exit(0);
}
process.on('SIGINT', () => stop('SIGINT'));
process.on('SIGTERM', () => stop('SIGTERM'));

async function loop() {
  while (!stopping) {
    const t0 = Date.now();
    const res = await callRunOnce();
    sideEffects.cycles_total++;
    if (res?.ok) {
      sideEffects.cycles_ok++;
      sideEffects.bugs_detected += res.bugsCount || 0;
      sideEffects.bugs_critical += res.criticalCount || 0;
      sideEffects.deepseek_calls_estimated += 2;
      sideEffects.consecutive_errors = 0;
      console.log(
        `[ai-ops-daemon] cycle #${res.cycleNumber} OK — bugs=${res.bugsCount} crit=${res.criticalCount} user="${(res.userMessage || '').slice(0, 60)}"`,
      );
    } else {
      sideEffects.cycles_failed++;
      sideEffects.consecutive_errors++;
      console.log(`[ai-ops-daemon] cycle FAIL — ${res?.error}`);
      if (sideEffects.consecutive_errors === 5) {
        notifyTelegram(
          `🚨 Talk2Me AI Ops daemon — 5 erreurs consécutives.\nLast: ${res?.error}`,
        );
      }
    }

    if (sideEffects.cycles_total % 5 === 0) writeReport(false);

    if (MAX_CYCLES > 0 && sideEffects.cycles_total >= MAX_CYCLES) {
      console.log(`[ai-ops-daemon] reached MAX_CYCLES=${MAX_CYCLES}, stopping`);
      stop('max_cycles');
      return;
    }

    const elapsed = Date.now() - t0;
    const sleepMs = Math.max(500, INTERVAL_MS - elapsed);
    await new Promise((r) => setTimeout(r, sleepMs));
  }
}

loop().catch((e) => {
  console.error('[ai-ops-daemon] loop crashed:', e);
  writeReport(true);
  process.exit(1);
});
