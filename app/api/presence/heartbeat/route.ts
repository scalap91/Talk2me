/**
 * POST /api/presence/heartbeat
 * Marque l'user courant comme online (last_seen = now).
 * Le client appelle ça toutes les 30s.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { updatePresence } from '@/lib/db';
import { publish } from '@/lib/realtime-bus';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const me = getCurrentUserFromRequest(request);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let status: 'online' | 'away' | 'offline' = 'online';
  try {
    const body = (await request.json()) as { status?: string };
    if (body?.status === 'away' || body?.status === 'offline') {
      status = body.status;
    }
  } catch {
    // body vide, OK
  }
  const pres = updatePresence(me.id, status);
  // Broadcast présence sur canal user (ami écoute /api/presence/events)
  publish(`presence:${me.id}`, {
    kind: 'state',
    data: { user_id: me.id, last_seen: pres.last_seen, status: pres.status },
  });
  return NextResponse.json({ ok: true, presence: pres });
}
