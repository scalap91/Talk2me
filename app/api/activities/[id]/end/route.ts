/**
 * POST /api/activities/[id]/end
 *
 * Phase 5 — Termine une activité synchronisée. Broadcast activity_end sur
 * le canal SSE conv:{convId} pour cleanup côté tous les participants.
 *
 * Sécurité : user doit être participant de la conv de l'activité.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { endActivity, userCanAccessActivity } from '@/lib/db';
import { publish } from '@/lib/realtime-bus';
// Talk2Me #403 — cleanup Room SFU si activity vidéo (groupe Watch Together).
import { closeRoom } from '@/lib/sfu/rooms';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Params {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, ctx: Params) {
  const me = getCurrentUserFromRequest(request);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { id } = await ctx.params;
  const access = userCanAccessActivity(id, me.id);
  if (!access) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  endActivity(id);
  // #403 — ferme la Room SFU (router + transports). Idempotent si jamais
  // créée (activity sans appel groupe → noop).
  closeRoom(id);

  publish(`conv:${access.convId}`, {
    kind: 'activity_end',
    data: {
      conversation_id: access.convId,
      activity_id: id,
      from_user_id: me.id,
      sent_at: Date.now(),
    },
  });

  return NextResponse.json({ ok: true });
}
