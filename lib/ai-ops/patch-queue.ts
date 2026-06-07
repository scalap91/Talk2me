/**
 * Talk2Me #406 — AI Ops Patch Queue (Pascal 2026-06-05).
 *
 * Le Fix Agent propose des patches, ils sont stockés ici. AUCUN auto-merge.
 * Pascal valide via Telegram (approve/reject) ou page admin /admin/patches.
 *
 * Verbatim Pascal : "Auto-merge fix Agent : STRICTEMENT NON".
 *
 * Doctrine [[feedback-modular-no-scattered-patches]] : 1 patch = 1 fichier
 * cible précis. Patches chirurgicaux uniquement.
 */

import { randomUUID } from 'node:crypto';
import { getDb } from '@/lib/db';

export type PatchType = 'prompt' | 'regex' | 'code' | 'config';
export type PatchStatus = 'pending' | 'approved' | 'rejected';

export interface PatchRow {
  id: string;
  proposed_by_agent: string;
  source_bug_pattern: string | null;
  target_file: string | null;
  patch_type: PatchType | null;
  diff: string;
  explanation: string;
  expected_improvement: string | null;
  status: PatchStatus;
  proposed_at: number;
  reviewed_at: number | null;
  reviewed_by: string | null;
  review_notes: string | null;
}

export function enqueuePatch(args: {
  proposedByAgent: string;
  sourceBugPattern?: string | null;
  targetFile?: string | null;
  patchType?: PatchType | null;
  diff: string;
  explanation: string;
  expectedImprovement?: string | null;
}): PatchRow {
  const db = getDb();
  const id = randomUUID();
  const now = Date.now();
  db.prepare(
    `INSERT INTO patch_queue (
       id, proposed_by_agent, source_bug_pattern, target_file, patch_type,
       diff, explanation, expected_improvement, status, proposed_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
  ).run(
    id,
    args.proposedByAgent,
    args.sourceBugPattern || null,
    args.targetFile || null,
    args.patchType || null,
    (args.diff || '').slice(0, 8000),
    (args.explanation || '').slice(0, 2000),
    args.expectedImprovement || null,
    now,
  );
  return {
    id,
    proposed_by_agent: args.proposedByAgent,
    source_bug_pattern: args.sourceBugPattern || null,
    target_file: args.targetFile || null,
    patch_type: args.patchType || null,
    diff: args.diff,
    explanation: args.explanation,
    expected_improvement: args.expectedImprovement || null,
    status: 'pending',
    proposed_at: now,
    reviewed_at: null,
    reviewed_by: null,
    review_notes: null,
  };
}

export function listPatches(status?: PatchStatus, limit = 100): PatchRow[] {
  const db = getDb();
  if (status) {
    return db
      .prepare(
        'SELECT * FROM patch_queue WHERE status = ? ORDER BY proposed_at DESC LIMIT ?',
      )
      .all(status, limit) as PatchRow[];
  }
  return db
    .prepare('SELECT * FROM patch_queue ORDER BY proposed_at DESC LIMIT ?')
    .all(limit) as PatchRow[];
}

export function getPatch(id: string): PatchRow | null {
  const db = getDb();
  return (
    (db.prepare('SELECT * FROM patch_queue WHERE id = ?').get(id) as
      | PatchRow
      | undefined) || null
  );
}

export function reviewPatch(
  id: string,
  decision: 'approved' | 'rejected',
  reviewedBy: string,
  notes?: string,
): boolean {
  const db = getDb();
  const res = db
    .prepare(
      `UPDATE patch_queue
       SET status = ?, reviewed_at = ?, reviewed_by = ?, review_notes = ?
       WHERE id = ? AND status = 'pending'`,
    )
    .run(decision, Date.now(), reviewedBy, notes || null, id);
  return res.changes > 0;
}

export function countPending(): number {
  const db = getDb();
  const row = db
    .prepare("SELECT COUNT(*) AS c FROM patch_queue WHERE status = 'pending'")
    .get() as { c: number };
  return row.c;
}
