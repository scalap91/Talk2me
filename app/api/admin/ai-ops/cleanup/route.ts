/**
 * Talk2Me #406 — POST /api/admin/ai-ops/cleanup (Pascal 2026-06-05).
 *
 * Purge tous les fake users AI Ops + leurs convs/messages/sessions/habits.
 *
 * Doctrine [[talk2me-pii-air-gap]] : fake users isolés, faciles à supprimer.
 * Doctrine [[feedback-fuzz-rapport-obligatoire]] : cleanup obligatoire post-fuzz.
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { isAiOpsAdmin } from '@/lib/ai-ops/auth';
import { cleanupFakeUsers } from '@/lib/ai-ops/lea-bridge';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const me = getCurrentUserFromRequest(request);
  if (!me || !isAiOpsAdmin(me.id, me.email)) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  try {
    const stats = cleanupFakeUsers();
    return NextResponse.json({ ok: true, stats });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 500 },
    );
  }
}
