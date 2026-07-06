/**
 * GET /api/compute/stats (Pascal 2026-07-04) — ADMIN ONLY.
 * Panneau dev du compute mesh : état du POOL (téléphones dispo, par tier, en charge) +
 * progression des GPU (tâches en attente/en cours/terminées, batches actifs).
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { isAdminCapable } from '@/lib/permissions';
import { getDb } from '@/lib/db';
import { queueStats } from '@/lib/compute/task-queue';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!isAdminCapable(me.id, me.email)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  let pool = { registered: 0, available_now: 0, good: 0, medium: 0, charging: 0 };
  try {
    const since = Date.now() - 90_000;    // « dispo » = vu dans les 90 dernières secondes
    const recent = Date.now() - 600_000;  // « connus » = vu dans les 10 dernières minutes (pas depuis toujours)
    const row = getDb().prepare(
      `SELECT SUM(CASE WHEN last_seen>? THEN 1 ELSE 0 END) AS registered,
         SUM(CASE WHEN last_seen>? THEN 1 ELSE 0 END) AS available_now,
         SUM(CASE WHEN last_seen>? AND tier='good' THEN 1 ELSE 0 END) AS good,
         SUM(CASE WHEN last_seen>? AND tier='medium' THEN 1 ELSE 0 END) AS medium,
         SUM(CASE WHEN last_seen>? AND charging=1 THEN 1 ELSE 0 END) AS charging
       FROM compute_workers`
    ).get(recent, since, since, since, since) as Record<string, number> | undefined;
    if (row) pool = { registered: row.registered || 0, available_now: row.available_now || 0, good: row.good || 0, medium: row.medium || 0, charging: row.charging || 0 };
  } catch { /* table pas encore créée */ }

  return NextResponse.json({ ok: true, pool, queue: queueStats() });
}
