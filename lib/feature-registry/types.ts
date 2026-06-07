/**
 * Talk2Me #409 — Feature Registry types (Pascal 2026-06-05).
 *
 * Types partagés entre :
 *   - le runner mjs (tests/feature-registry/runner.mjs)
 *   - les helpers TS (lib/feature-registry/*.ts)
 *   - les routes API admin (/api/admin/features/*)
 *   - le dashboard /schema/features
 *
 * Doctrine [[feedback-modular-no-scattered-patches]] : 1 module ici, pas
 * éparpillé. Le runner mjs lit registry.json + checks/*.mjs, écrit en DB
 * via better-sqlite3 direct (pas de fetch).
 */

export type FeatureStatus =
  | 'live' // dernier run = pass
  | 'broken' // 3+ consecutive_fails
  | 'flaky' // alterne pass/fail
  | 'deprecated' // feature retirée volontairement
  | 'pending_test'; // déclarée mais aucun run encore

export interface FeatureRow {
  id: string;
  module: string;
  feature_name: string;
  description: string | null;
  added_at: number;
  added_in_task: string | null;
  test_path: string | null;
  last_pass_at: number | null;
  last_fail_at: number | null;
  last_fail_reason: string | null;
  consecutive_fails: number;
  status: FeatureStatus;
}

export interface FeatureTestRunRow {
  id: string;
  run_at: number;
  ended_at: number | null;
  total: number | null;
  passed: number | null;
  failed: number | null;
  flaky: number | null;
  duration_ms: number | null;
  report_path: string | null;
  trigger: 'cron' | 'deploy' | 'manual' | 'pre-commit' | string | null;
}

export interface FeatureTestResultRow {
  id: string;
  run_id: string;
  feature_id: string;
  passed: 0 | 1;
  duration_ms: number | null;
  error_message: string | null;
  evidence: string | null; // JSON
}

export interface ModuleHealthSummary {
  module: string;
  live: number;
  broken: number;
  flaky: number;
  pending: number;
  deprecated: number;
  total: number;
  pass_rate: number; // 0..1, live / (total - deprecated)
}
