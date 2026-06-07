/**
 * Talk2Me #406 — POST /api/admin/ai-ops/patch/[id]/reject (Pascal 2026-06-05).
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { isAiOpsAdmin } from '@/lib/ai-ops/auth';
import { reviewPatch } from '@/lib/ai-ops/patch-queue';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const me = getCurrentUserFromRequest(request);
  if (!me || !isAiOpsAdmin(me.id, me.email)) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  const { id } = await ctx.params;
  let notes: string | undefined;
  try {
    const body = await request.json();
    if (typeof body?.notes === 'string') notes = body.notes;
  } catch {}
  const ok = reviewPatch(id, 'rejected', me.email || me.id, notes);
  if (!ok) {
    return NextResponse.json(
      { ok: false, error: 'patch_not_pending_or_missing' },
      { status: 404 },
    );
  }
  return NextResponse.json({ ok: true });
}
