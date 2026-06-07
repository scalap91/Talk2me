/**
 * Talk2Me #406+#407 — POST /api/admin/ai-ops/run-once (Pascal 2026-06-05).
 *
 * Endpoint appelé par le daemon ai-ops-daemon.mjs à chaque cycle. Exécute
 * UN cycle complet du pipeline (Generator → Léa → Critic → ...).
 *
 * Auth :
 *  - x-ai-ops-daemon-token : pour le daemon (secret partagé)
 *  - OR session admin (Pascal)
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { isAiOpsAdmin, isDaemonRequest } from '@/lib/ai-ops/auth';
import { runCycle } from '@/lib/ai-ops/orchestrator';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const daemonToken = request.headers.get('x-ai-ops-daemon-token');
  const isDaemon = isDaemonRequest(daemonToken);

  if (!isDaemon) {
    const me = getCurrentUserFromRequest(request);
    if (!me || !isAiOpsAdmin(me.id, me.email)) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
  }

  try {
    const result = await runCycle();
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 500 },
    );
  }
}
