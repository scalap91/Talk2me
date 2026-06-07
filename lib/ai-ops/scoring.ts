/**
 * Talk2Me #407 — AI Ops Scoring (Pascal 2026-06-05).
 *
 * Helpers DB pour agent_scores + agent_perf_daily. Note les agents comme
 * des "ouvriers qui apprennent leur taf" (verbatim Pascal #407).
 *
 * Critères standards :
 *  - objective_met  : la tâche a-t-elle été accomplie ?
 *  - quality        : qualité du résultat (cohérence, exactitude)
 *  - doctrine_respect : a-t-il respecté les doctrines projet ?
 *  - side_effects   : effets de bord causés (0 = neutre, 10 = aucun)
 */

import { randomUUID } from 'node:crypto';
import { getDb } from '@/lib/db';

export type ScoreCriterion =
  | 'objective_met'
  | 'quality'
  | 'doctrine_respect'
  | 'side_effects';

export interface ScoreRow {
  id: string;
  mission_id: string;
  criterion: ScoreCriterion;
  score_0_10: number;
  judge_id: string | null;
  notes: string | null;
  scored_at: number;
}

export function recordScore(args: {
  missionId: string;
  criterion: ScoreCriterion;
  score: number; // 0..10
  judgeId?: string | null;
  notes?: string | null;
}): ScoreRow {
  const db = getDb();
  const id = randomUUID();
  const now = Date.now();
  const clamped = Math.max(0, Math.min(10, args.score));
  db.prepare(
    `INSERT INTO agent_scores (id, mission_id, criterion, score_0_10, judge_id, notes, scored_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    args.missionId,
    args.criterion,
    clamped,
    args.judgeId || null,
    args.notes || null,
    now,
  );
  return {
    id,
    mission_id: args.missionId,
    criterion: args.criterion,
    score_0_10: clamped,
    judge_id: args.judgeId || null,
    notes: args.notes || null,
    scored_at: now,
  };
}

export function getMissionScores(missionId: string): ScoreRow[] {
  const db = getDb();
  return db
    .prepare('SELECT * FROM agent_scores WHERE mission_id = ?')
    .all(missionId) as ScoreRow[];
}

/** Calcule la moyenne pondérée des scores pour un agent sur une période. */
export function getAgentAvgScore(
  agentId: string,
  sinceMs: number,
): number | null {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT AVG(s.score_0_10) AS avg
       FROM agent_scores s
       JOIN agent_missions m ON m.id = s.mission_id
       WHERE m.agent_id = ? AND s.scored_at >= ?`,
    )
    .get(agentId, sinceMs) as { avg: number | null } | undefined;
  return row?.avg ?? null;
}

/** YYYY-MM-DD UTC pour un timestamp ms. */
export function dateKey(tsMs: number): string {
  return new Date(tsMs).toISOString().slice(0, 10);
}

/**
 * Agrège la perf journalière à partir de agent_missions + agent_scores.
 * Idempotent : remplace la ligne du jour pour chaque agent.
 */
export function aggregatePerfDaily(forDateKey?: string): {
  agents: number;
  date: string;
} {
  const db = getDb();
  const today = forDateKey || dateKey(Date.now());
  const startMs = Date.parse(today + 'T00:00:00.000Z');
  const endMs = startMs + 24 * 60 * 60 * 1000;

  const agents = db
    .prepare(
      `SELECT DISTINCT agent_id FROM agent_missions
       WHERE started_at >= ? AND started_at < ?`,
    )
    .all(startMs, endMs) as { agent_id: string }[];

  let count = 0;
  for (const a of agents) {
    const aid = a.agent_id;
    const stats = db
      .prepare(
        `SELECT COUNT(*) AS total,
                SUM(CASE WHEN status = 'failed' OR status = 'timeout' THEN 1 ELSE 0 END) AS failed,
                COALESCE(SUM(cost_usd), 0) AS cost
         FROM agent_missions
         WHERE agent_id = ? AND started_at >= ? AND started_at < ?`,
      )
      .get(aid, startMs, endMs) as {
      total: number;
      failed: number;
      cost: number;
    };
    const scoreRow = db
      .prepare(
        `SELECT AVG(s.score_0_10) AS avg
         FROM agent_scores s
         JOIN agent_missions m ON m.id = s.mission_id
         WHERE m.agent_id = ? AND m.started_at >= ? AND m.started_at < ?`,
      )
      .get(aid, startMs, endMs) as { avg: number | null };

    db.prepare(
      `INSERT INTO agent_perf_daily (agent_id, date, missions_count, missions_failed, avg_score, total_cost_usd)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(agent_id, date) DO UPDATE SET
         missions_count = excluded.missions_count,
         missions_failed = excluded.missions_failed,
         avg_score = excluded.avg_score,
         total_cost_usd = excluded.total_cost_usd`,
    ).run(
      aid,
      today,
      stats.total,
      stats.failed,
      scoreRow.avg,
      stats.cost,
    );
    count++;
  }
  return { agents: count, date: today };
}

export interface PerfDailyRow {
  agent_id: string;
  date: string;
  missions_count: number;
  missions_failed: number;
  avg_score: number | null;
  total_cost_usd: number;
}

export function getPerfDailyRange(daysBack = 7): PerfDailyRow[] {
  const db = getDb();
  const cutoff = dateKey(Date.now() - daysBack * 24 * 60 * 60 * 1000);
  return db
    .prepare(
      'SELECT * FROM agent_perf_daily WHERE date >= ? ORDER BY date DESC, agent_id ASC',
    )
    .all(cutoff) as PerfDailyRow[];
}

/** Compte les bugs enregistrés sur N missions Critic récentes par catégorie. */
export function recordBug(args: {
  missionId: string;
  bugType: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  evidence: string;
  suggestedFixCategory?: string | null;
}): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO ai_ops_bugs (id, mission_id, bug_type, severity, evidence, suggested_fix_category, detected_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    randomUUID(),
    args.missionId,
    args.bugType,
    args.severity,
    (args.evidence || '').slice(0, 1000),
    args.suggestedFixCategory || null,
    Date.now(),
  );
}

export interface RecentBugRow {
  id: string;
  mission_id: string;
  bug_type: string;
  severity: string;
  evidence: string | null;
  suggested_fix_category: string | null;
  detected_at: number;
}

export function getRecentBugs(limit = 50): RecentBugRow[] {
  const db = getDb();
  return db
    .prepare(
      'SELECT * FROM ai_ops_bugs WHERE resolved_at IS NULL ORDER BY detected_at DESC LIMIT ?',
    )
    .all(limit) as RecentBugRow[];
}

/**
 * Talk2Me #408b — Récupère la série temporelle agrégée GLOBALE Léa (rôle 'lea')
 * sur les N derniers jours. Renvoie une ligne par jour, agrégée sur tous les
 * agents 'lea' (même rôle, plusieurs versions de prompt possibles).
 *
 * Utilisé par /schema/ai-ops pour la courbe "progression quotidienne Léa".
 */
export interface LeaDailyPoint {
  date: string;
  avg_score: number | null;
  missions_count: number;
  missions_failed: number;
  total_cost_usd: number;
}

export function getLeaDailyTrend(daysBack = 30): LeaDailyPoint[] {
  const db = getDb();
  const cutoff = dateKey(Date.now() - daysBack * 24 * 60 * 60 * 1000);
  // On joint perf_daily aux agents pour filtrer rôle 'lea', puis agrège par date.
  // avg_score est lui-même une moyenne par agent → on fait une moyenne pondérée
  // par missions_count (sinon un agent peu actif fausse la courbe).
  const rows = db
    .prepare(
      `SELECT p.date,
              SUM(p.missions_count) AS missions_count,
              SUM(p.missions_failed) AS missions_failed,
              SUM(p.total_cost_usd) AS total_cost_usd,
              SUM(CASE WHEN p.avg_score IS NOT NULL
                       THEN p.avg_score * p.missions_count ELSE 0 END) AS score_num,
              SUM(CASE WHEN p.avg_score IS NOT NULL
                       THEN p.missions_count ELSE 0 END) AS score_denom
       FROM agent_perf_daily p
       JOIN agent_registry a ON a.id = p.agent_id
       WHERE a.role = 'lea' AND p.date >= ?
       GROUP BY p.date
       ORDER BY p.date ASC`,
    )
    .all(cutoff) as Array<{
    date: string;
    missions_count: number;
    missions_failed: number;
    total_cost_usd: number;
    score_num: number;
    score_denom: number;
  }>;
  return rows.map((r) => ({
    date: r.date,
    avg_score: r.score_denom > 0 ? r.score_num / r.score_denom : null,
    missions_count: r.missions_count,
    missions_failed: r.missions_failed,
    total_cost_usd: r.total_cost_usd,
  }));
}

/**
 * Score Léa sur les dernières N millisecondes (fenêtre glissante).
 * Retourne la moyenne pondérée par mission (cohérent avec getLeaDailyTrend).
 */
export function getLeaAvgScoreSince(sinceMs: number): {
  avg: number | null;
  missions: number;
} {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT AVG(s.score_0_10) AS avg, COUNT(s.id) AS scored
       FROM agent_scores s
       JOIN agent_missions m ON m.id = s.mission_id
       JOIN agent_registry a ON a.id = m.agent_id
       WHERE a.role = 'lea' AND s.scored_at >= ?`,
    )
    .get(sinceMs) as { avg: number | null; scored: number } | undefined;
  const mc = db
    .prepare(
      `SELECT COUNT(*) AS c FROM agent_missions m
       JOIN agent_registry a ON a.id = m.agent_id
       WHERE a.role = 'lea' AND m.started_at >= ?`,
    )
    .get(sinceMs) as { c: number } | undefined;
  return { avg: row?.avg ?? null, missions: mc?.c || 0 };
}

/** Agrégation des bugs par type pour le Fix Agent. */
export function getBugsGroupedByType(): Array<{
  bug_type: string;
  count: number;
  critical_count: number;
  sample_evidence: string;
}> {
  const db = getDb();
  return db
    .prepare(
      `SELECT bug_type,
              COUNT(*) AS count,
              SUM(CASE WHEN severity = 'critical' THEN 1 ELSE 0 END) AS critical_count,
              MAX(evidence) AS sample_evidence
       FROM ai_ops_bugs
       WHERE resolved_at IS NULL
       GROUP BY bug_type
       ORDER BY count DESC
       LIMIT 20`,
    )
    .all() as Array<{
    bug_type: string;
    count: number;
    critical_count: number;
    sample_evidence: string;
  }>;
}
