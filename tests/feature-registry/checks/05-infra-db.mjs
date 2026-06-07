/**
 * Talk2Me #409 — Checks infrastructure (PM2 + DB tables).
 */

import { pm2Online, REPO_ROOT } from '../_helpers.mjs';
import path from 'node:path';
import { existsSync } from 'node:fs';

async function checkPm2(name) {
  const t0 = Date.now();
  const s = pm2Online(name);
  return {
    passed: s.ok,
    duration_ms: Date.now() - t0,
    error: s.ok ? null : `pm2 ${name} : ${s.reason}`,
    evidence: { name, status: s.reason },
  };
}

async function checkDbTable(table) {
  const t0 = Date.now();
  // Doit pointer sur la MÊME DB que /lib/db.ts (data/talktome.db).
  const dbPath = process.env.FEATURE_REGISTRY_DB_PATH || path.join(REPO_ROOT, 'data', 'talktome.db');
  if (!existsSync(dbPath)) {
    return { passed: false, duration_ms: Date.now() - t0, error: 'talktome.db introuvable', evidence: { path: dbPath } };
  }
  try {
    const Database = (await import('better-sqlite3')).default;
    const db = new Database(dbPath, { readonly: true, fileMustExist: true });
    const row = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
      .get(table);
    db.close();
    const passed = !!row;
    return {
      passed,
      duration_ms: Date.now() - t0,
      error: passed ? null : `Table ${table} absente`,
      evidence: { table, found: passed },
    };
  } catch (e) {
    return {
      passed: false,
      duration_ms: Date.now() - t0,
      error: `DB error: ${e?.message}`,
      evidence: { table },
    };
  }
}

export const CHECKS = [
  { FEATURE: { id: 'pm2-talktome-online' }, run: () => checkPm2('talktome') },
  { FEATURE: { id: 'pm2-ai-ops-daemon-online' }, run: () => checkPm2('ai-ops-daemon') },
  { FEATURE: { id: 'pm2-tg-bridge-online' }, run: () => checkPm2('tg-bridge') },
  { FEATURE: { id: 'db-feature-registry-table' }, run: () => checkDbTable('feature_registry') },
  { FEATURE: { id: 'db-card-likes-table' }, run: () => checkDbTable('card_likes') },
];
