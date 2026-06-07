/**
 * Talk2Me #406+#407 — AI Ops Missions tracker (Pascal 2026-06-05).
 *
 * Open/close de missions avec coût tokens + USD. Une mission = une tâche
 * unitaire confiée à un agent (ex. générer un prompt user, critiquer une
 * réponse Léa, proposer un patch). Output tronqué pour DB léger.
 *
 * Doctrine [[project-bizzi-no-funding]] : coût USD tracké à chaque appel
 * pour garder la marge sous contrôle.
 */

import { randomUUID } from 'node:crypto';
import { getDb } from '@/lib/db';
import type { AgentRole } from './registry';

export type MissionStatus = 'open' | 'completed' | 'failed' | 'timeout';

export interface MissionRow {
  id: string;
  agent_id: string;
  role: AgentRole;
  objectives: string;
  started_at: number;
  ended_at: number | null;
  output: string | null;
  cost_tokens: number;
  cost_usd: number;
  status: MissionStatus;
}

const MAX_OUTPUT_CHARS = 4000;

/** Prix DeepSeek (input + output combined approx pour mode éco). */
const DEEPSEEK_USD_PER_1K_TOKENS = 0.0007; // moyenne pondérée input(0.27)+output(1.10) sur 50/50

export function estimateCostUsd(tokens: number): number {
  return (tokens / 1000) * DEEPSEEK_USD_PER_1K_TOKENS;
}

export function openMission(args: {
  agentId: string;
  role: AgentRole;
  objectives: Record<string, unknown>;
}): MissionRow {
  const db = getDb();
  const id = randomUUID();
  const now = Date.now();
  const objJson = JSON.stringify(args.objectives).slice(0, 2000);
  db.prepare(
    `INSERT INTO agent_missions (id, agent_id, role, objectives, started_at, status)
     VALUES (?, ?, ?, ?, ?, 'open')`,
  ).run(id, args.agentId, args.role, objJson, now);
  return {
    id,
    agent_id: args.agentId,
    role: args.role,
    objectives: objJson,
    started_at: now,
    ended_at: null,
    output: null,
    cost_tokens: 0,
    cost_usd: 0,
    status: 'open',
  };
}

export function closeMission(
  missionId: string,
  args: {
    status?: MissionStatus;
    output?: unknown;
    tokens?: number;
  },
): void {
  const db = getDb();
  const now = Date.now();
  const status: MissionStatus = args.status || 'completed';
  let outputStr: string | null = null;
  if (args.output !== undefined && args.output !== null) {
    outputStr =
      typeof args.output === 'string'
        ? args.output
        : JSON.stringify(args.output);
    if (outputStr.length > MAX_OUTPUT_CHARS) {
      outputStr = outputStr.slice(0, MAX_OUTPUT_CHARS) + '…[truncated]';
    }
  }
  const tokens = args.tokens || 0;
  const costUsd = estimateCostUsd(tokens);
  db.prepare(
    `UPDATE agent_missions
     SET ended_at = ?, output = ?, cost_tokens = ?, cost_usd = ?, status = ?
     WHERE id = ?`,
  ).run(now, outputStr, tokens, costUsd, status, missionId);
}

export function getMission(id: string): MissionRow | null {
  const db = getDb();
  return (
    (db
      .prepare('SELECT * FROM agent_missions WHERE id = ?')
      .get(id) as MissionRow | undefined) || null
  );
}

export function listRecentMissions(limit = 50): MissionRow[] {
  const db = getDb();
  return db
    .prepare('SELECT * FROM agent_missions ORDER BY started_at DESC LIMIT ?')
    .all(limit) as MissionRow[];
}

export function listMissionsByAgent(agentId: string, limit = 50): MissionRow[] {
  const db = getDb();
  return db
    .prepare(
      'SELECT * FROM agent_missions WHERE agent_id = ? ORDER BY started_at DESC LIMIT ?',
    )
    .all(agentId, limit) as MissionRow[];
}

/** Total coût USD sur les N dernières millisecondes (default 24h). */
export function totalCostSince(sinceMs: number): number {
  const db = getDb();
  const row = db
    .prepare(
      'SELECT COALESCE(SUM(cost_usd), 0) AS total FROM agent_missions WHERE started_at >= ?',
    )
    .get(sinceMs) as { total: number } | undefined;
  return row?.total || 0;
}

export function countMissionsSince(sinceMs: number): number {
  const db = getDb();
  const row = db
    .prepare(
      'SELECT COUNT(*) AS c FROM agent_missions WHERE started_at >= ?',
    )
    .get(sinceMs) as { c: number } | undefined;
  return row?.c || 0;
}
