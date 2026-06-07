/**
 * Talk2Me #406+#407 — GET /api/admin/ai-ops/status (Pascal 2026-06-05).
 *
 * Stats globales du système AI Ops : cycles, missions, coût, bugs ouverts,
 * patches en attente.
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { isAiOpsAdmin } from '@/lib/ai-ops/auth';
import {
  totalCostSince,
  countMissionsSince,
  listRecentMissions,
} from '@/lib/ai-ops/missions';
import { listAgents } from '@/lib/ai-ops/registry';
import {
  getRecentBugs,
  getBugsGroupedByType,
  getPerfDailyRange,
} from '@/lib/ai-ops/scoring';
import { countPending, listPatches } from '@/lib/ai-ops/patch-queue';
import { getOrchestratorState } from '@/lib/ai-ops/orchestrator';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const me = getCurrentUserFromRequest(request);
  if (!me || !isAiOpsAdmin(me.id, me.email)) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  const dayMs = 24 * 60 * 60 * 1000;
  const cost24h = totalCostSince(Date.now() - dayMs);
  const cost7d = totalCostSince(Date.now() - 7 * dayMs);
  const missions24h = countMissionsSince(Date.now() - dayMs);

  return NextResponse.json({
    orchestrator: getOrchestratorState(),
    agents: listAgents(),
    missions: {
      last_24h: missions24h,
      cost_usd_24h: Number(cost24h.toFixed(4)),
      cost_usd_7d: Number(cost7d.toFixed(4)),
      recent: listRecentMissions(20),
    },
    bugs: {
      recent: getRecentBugs(20),
      by_type: getBugsGroupedByType(),
    },
    patches: {
      pending: countPending(),
      recent: listPatches(undefined, 20),
    },
    perf_daily: getPerfDailyRange(7),
  });
}
