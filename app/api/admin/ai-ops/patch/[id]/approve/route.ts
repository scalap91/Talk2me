/**
 * Talk2Me #406 — POST /api/admin/ai-ops/patch/[id]/approve (Pascal 2026-06-05).
 *
 * Marque un patch comme approved. AUCUN code n'est appliqué automatiquement
 * (verbatim Pascal : "Auto-merge fix Agent : STRICTEMENT NON").
 *
 * L'approve sert juste de signal : Pascal (ou un sous-Claude humain en
 * supervision) appliquera manuellement le patch ensuite.
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
  const ok = reviewPatch(id, 'approved', me.email || me.id, notes);
  if (!ok) {
    return NextResponse.json(
      { ok: false, error: 'patch_not_pending_or_missing' },
      { status: 404 },
    );
  }
  return NextResponse.json({ ok: true });
}
