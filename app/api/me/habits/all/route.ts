/**
 * Talk2Me #338 — DELETE /api/me/habits/all
 *
 * Reset complet des habitudes apprises pour le user courant.
 * Strictement isolé par user_id.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { deleteAllUserHabits } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function DELETE(request: NextRequest) {
  const me = getCurrentUserFromRequest(request);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const deleted = deleteAllUserHabits(me.id);
  return NextResponse.json({ ok: true, deleted });
}
