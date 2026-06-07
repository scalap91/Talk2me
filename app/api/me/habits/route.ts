/**
 * Talk2Me #338 — Habitudes apprises de l'IA personnelle.
 *
 * GET /api/me/habits → liste groupée par kind (tri score DESC dans chaque groupe)
 *
 * Doctrine [[talktome-ia-persistance-isolation]] : isolation stricte user_id.
 * Doctrine [[talk2me-roadmap-6-phases]] Phase 1 : Pascal verbatim 2026-06-04 —
 * "IA personnelle persistante = différenciateur produit".
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { getUserHabitsGrouped, USER_HABIT_KINDS } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const me = getCurrentUserFromRequest(request);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const grouped = getUserHabitsGrouped(me.id, 50);
  const totalCount = USER_HABIT_KINDS.reduce(
    (acc, k) => acc + (grouped[k]?.length || 0),
    0,
  );
  return NextResponse.json({
    ok: true,
    total: totalCount,
    groups: USER_HABIT_KINDS.map((kind) => ({
      kind,
      habits: (grouped[kind] || []).map((h) => ({
        id: h.id,
        kind: h.kind,
        value: h.value,
        score: Number(h.score.toFixed(3)),
        occurrences: h.occurrences,
        first_seen_at: h.first_seen_at,
        last_seen_at: h.last_seen_at,
        source: h.source,
      })),
    })),
  });
}
