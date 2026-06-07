/**
 * GET /api/activities/active?conv_id=...
 *
 * Phase 5 — Retourne l'activité active d'une conversation (ou null) si
 * l'user est participant. Utilisé au load page pour reprendre une activité
 * en cours après refresh.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { getActiveActivity, getConversation } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const me = getCurrentUserFromRequest(request);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const convId = request.nextUrl.searchParams.get('conv_id')?.trim() ?? '';
  if (!convId) {
    return NextResponse.json({ error: 'conv_id_required' }, { status: 400 });
  }
  const conv = getConversation(convId, me.id);
  if (!conv) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const activity = getActiveActivity(convId);
  return NextResponse.json({ activity });
}
