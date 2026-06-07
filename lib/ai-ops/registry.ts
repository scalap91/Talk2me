/**
 * Talk2Me #406+#407 — AI Ops Agent Registry (Pascal 2026-06-05).
 *
 * Helpers DB pour table agent_registry. Chaque agent IA du projet est
 * "enregistré" comme un ouvrier nominatif. Ses missions, scores et
 * performance journalière sont ensuite trackés.
 *
 * Doctrine [[feedback-roles-via-agents]] : pas de hardcode, des agents en DB.
 * Doctrine [[project-bizzi-immeuble]] : registry = annuaire de l'immeuble.
 */

import { createHash, randomUUID } from 'node:crypto';
import { getDb } from '@/lib/db';

export type AgentRole =
  | 'generator'
  | 'critic'
  | 'fix'
  | 'judge'
  | 'lea'
  | 't2m_officiel';

export interface AgentRow {
  id: string;
  role: AgentRole;
  model: string;
  system_prompt_hash: string | null;
  created_at: number;
  status: 'active' | 'paused' | 'retired';
}

/** Hash stable d'un system prompt pour détecter les changements. */
export function hashPrompt(prompt: string): string {
  return createHash('sha256').update(prompt).digest('hex').slice(0, 16);
}

/** Crée ou récupère un agent par (role, model, prompt_hash). Idempotent. */
export function ensureAgent(args: {
  role: AgentRole;
  model: string;
  systemPrompt: string;
}): AgentRow {
  const db = getDb();
  const promptHash = hashPrompt(args.systemPrompt);
  const existing = db
    .prepare(
      'SELECT * FROM agent_registry WHERE role = ? AND model = ? AND system_prompt_hash = ? AND status = ? LIMIT 1',
    )
    .get(args.role, args.model, promptHash, 'active') as AgentRow | undefined;
  if (existing) return existing;
  const id = `${args.role}-${randomUUID().slice(0, 8)}`;
  const now = Date.now();
  db.prepare(
    `INSERT INTO agent_registry (id, role, model, system_prompt_hash, created_at, status)
     VALUES (?, ?, ?, ?, ?, 'active')`,
  ).run(id, args.role, args.model, promptHash, now);
  return {
    id,
    role: args.role,
    model: args.model,
    system_prompt_hash: promptHash,
    created_at: now,
    status: 'active',
  };
}

export function listAgents(): AgentRow[] {
  const db = getDb();
  return db
    .prepare('SELECT * FROM agent_registry ORDER BY created_at DESC')
    .all() as AgentRow[];
}

export function getAgent(id: string): AgentRow | null {
  const db = getDb();
  return (
    (db
      .prepare('SELECT * FROM agent_registry WHERE id = ?')
      .get(id) as AgentRow | undefined) || null
  );
}

export function retireAgent(id: string): void {
  const db = getDb();
  db.prepare("UPDATE agent_registry SET status = 'retired' WHERE id = ?").run(id);
}
