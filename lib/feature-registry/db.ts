/**
 * Talk2Me #409 — Feature Registry DB helpers (Pascal 2026-06-05).
 *
 * Helpers de lecture/écriture autour des 3 tables feature_registry,
 * feature_test_runs, feature_test_results.
 *
 * Le runner mjs (côté script) écrit via better-sqlite3 direct dans le même
 * fichier talktome.db (pas via ces helpers TS — évite double init du SDK).
 * Ces helpers servent au dashboard /schema/features et aux routes API.
 *
 * Doctrine [[feedback-modular-no-scattered-patches]].
 */

import { getDb } from '@/lib/db';
import type {
  FeatureRow,
  FeatureStatus,
  FeatureTestResultRow,
  FeatureTestRunRow,
  ModuleHealthSummary,
} from './types';

// ===== Read helpers =====

export function listFeatures(opts?: {
  module?: string;
  status?: FeatureStatus;
  limit?: number;
}): FeatureRow[] {
  const db = getDb();
  const wh: string[] = [];
  const args: unknown[] = [];
  if (opts?.module) {
    wh.push('module = ?');
    args.push(opts.module);
  }
  if (opts?.status) {
    wh.push('status = ?');
    args.push(opts.status);
  }
  const where = wh.length ? `WHERE ${wh.join(' AND ')}` : '';
  const limit = opts?.limit ? `LIMIT ${Number(opts.limit)}` : '';
  return db
    .prepare(
      `SELECT * FROM feature_registry ${where} ORDER BY module ASC, feature_name ASC ${limit}`,
    )
    .all(...args) as FeatureRow[];
}

export function getFeature(id: string): FeatureRow | null {
  const db = getDb();
  return (
    (db
      .prepare('SELECT * FROM feature_registry WHERE id = ?')
      .get(id) as FeatureRow | undefined) || null
  );
}

export function listModules(): string[] {
  const db = getDb();
  return (
    db
      .prepare(
        "SELECT DISTINCT module FROM feature_registry WHERE status != 'deprecated' ORDER BY module ASC",
      )
      .all() as { module: string }[]
  ).map((r) => r.module);
}

export function moduleHealth(): ModuleHealthSummary[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT module, status, COUNT(*) as n FROM feature_registry GROUP BY module, status`,
    )
    .all() as { module: string; status: FeatureStatus; n: number }[];

  const by: Map<string, ModuleHealthSummary> = new Map();
  for (const r of rows) {
    let s = by.get(r.module);
    if (!s) {
      s = {
        module: r.module,
        live: 0,
        broken: 0,
        flaky: 0,
        pending: 0,
        deprecated: 0,
        total: 0,
        pass_rate: 0,
      };
      by.set(r.module, s);
    }
    if (r.status === 'live') s.live = r.n;
    else if (r.status === 'broken') s.broken = r.n;
    else if (r.status === 'flaky') s.flaky = r.n;
    else if (r.status === 'pending_test') s.pending = r.n;
    else if (r.status === 'deprecated') s.deprecated = r.n;
    s.total += r.n;
  }
  for (const s of by.values()) {
    const denom = s.total - s.deprecated;
    s.pass_rate = denom > 0 ? s.live / denom : 1;
  }
  return Array.from(by.values()).sort((a, b) =>
    a.module.localeCompare(b.module),
  );
}

export function globalHealth(): {
  total: number;
  live: number;
  broken: number;
  flaky: number;
  pending: number;
  deprecated: number;
  pass_rate: number;
} {
  const mods = moduleHealth();
  const acc = { total: 0, live: 0, broken: 0, flaky: 0, pending: 0, deprecated: 0 };
  for (const m of mods) {
    acc.total += m.total;
    acc.live += m.live;
    acc.broken += m.broken;
    acc.flaky += m.flaky;
    acc.pending += m.pending;
    acc.deprecated += m.deprecated;
  }
  const denom = acc.total - acc.deprecated;
  return { ...acc, pass_rate: denom > 0 ? acc.live / denom : 1 };
}

export function lastRuns(limit = 20): FeatureTestRunRow[] {
  const db = getDb();
  return db
    .prepare('SELECT * FROM feature_test_runs ORDER BY run_at DESC LIMIT ?')
    .all(limit) as FeatureTestRunRow[];
}

export function lastRun(): FeatureTestRunRow | null {
  const rows = lastRuns(1);
  return rows[0] || null;
}

export function featureHistory(
  featureId: string,
  limit = 30,
): FeatureTestResultRow[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT r.* FROM feature_test_results r
       JOIN feature_test_runs fr ON fr.id = r.run_id
       WHERE r.feature_id = ?
       ORDER BY fr.run_at DESC LIMIT ?`,
    )
    .all(featureId, limit) as FeatureTestResultRow[];
}

export function lastRunResults(runId: string): FeatureTestResultRow[] {
  const db = getDb();
  return db
    .prepare('SELECT * FROM feature_test_results WHERE run_id = ?')
    .all(runId) as FeatureTestResultRow[];
}

// ===== Write helpers (utilisés par /api/admin/features/upsert + runner future) =====

export function upsertFeature(args: {
  id: string;
  module: string;
  feature_name: string;
  description?: string | null;
  added_in_task?: string | null;
  test_path?: string | null;
  status?: FeatureStatus;
}): FeatureRow {
  const db = getDb();
  const existing = getFeature(args.id);
  const now = Date.now();
  if (existing) {
    db.prepare(
      `UPDATE feature_registry SET module=?, feature_name=?, description=?, added_in_task=?, test_path=? WHERE id=?`,
    ).run(
      args.module,
      args.feature_name,
      args.description ?? null,
      args.added_in_task ?? null,
      args.test_path ?? null,
      args.id,
    );
  } else {
    db.prepare(
      `INSERT INTO feature_registry
        (id, module, feature_name, description, added_at, added_in_task, test_path, status)
        VALUES (?,?,?,?,?,?,?,?)`,
    ).run(
      args.id,
      args.module,
      args.feature_name,
      args.description ?? null,
      now,
      args.added_in_task ?? null,
      args.test_path ?? null,
      args.status ?? 'pending_test',
    );
  }
  return getFeature(args.id)!;
}
