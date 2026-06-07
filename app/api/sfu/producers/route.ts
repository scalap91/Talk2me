/**
 * GET /api/sfu/producers?activity_id=...
 *
 * Liste les producers actifs des autres peers dans la room (utile pour
 * re-sync après reconnexion SSE). Le client appelle ça si une page reload
 * pendant une session active.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { authForActivity } from '@/lib/sfu/auth-helpers';
import { getRoom, listRemoteProducers } from '@/lib/sfu/rooms';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const activityId = request.nextUrl.searchParams.get('activity_id') || '';
  const auth = authForActivity(request, activityId);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const room = getRoom(auth.ctx.activityId);
  if (!room) return NextResponse.json({ ok: true, producers: [] });

  return NextResponse.json({
    ok: true,
    producers: listRemoteProducers(room, auth.ctx.me.id),
  });
}
