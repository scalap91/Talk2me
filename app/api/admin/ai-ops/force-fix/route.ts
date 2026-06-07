/**
 * Talk2Me #406 — POST /api/admin/ai-ops/force-fix (Pascal 2026-06-05).
 *
 * Force le Fix Agent à analyser les bugs en attente et proposer des patches
 * immédiatement (sans attendre le quota FIX_EVERY_N_CYCLES).
 *
 * Utile pour : tests E2E, debug, déclenchement manuel après vague de bugs.
 * Auth : admin OU daemon token.
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { isAiOpsAdmin, isDaemonRequest } from '@/lib/ai-ops/auth';
import { fixProposePatches } from '@/lib/ai-ops/agents/fix-agent';
import { getBugsGroupedByType } from '@/lib/ai-ops/scoring';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const daemonToken = request.headers.get('x-ai-ops-daemon-token');
  if (!isDaemonRequest(daemonToken)) {
    const me = getCurrentUserFromRequest(request);
    if (!me || !isAiOpsAdmin(me.id, me.email)) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
  }
  try {
    const bugs = getBugsGroupedByType();
    if (bugs.length === 0) {
      return NextResponse.json({ ok: true, enqueued: 0, reason: 'no_bugs' });
    }
    const fix = await fixProposePatches({ bugsByType: bugs });
    return NextResponse.json({
      ok: true,
      enqueued: fix.enqueued,
      patches: fix.patches.map((p) => ({
        target_file: p.target_file,
        patch_type: p.patch_type,
        explanation: p.explanation.slice(0, 200),
      })),
      tokens: fix.tokens,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 500 },
    );
  }
}
