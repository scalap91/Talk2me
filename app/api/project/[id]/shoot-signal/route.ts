import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { publish } from '@/lib/realtime-bus';
import { startLiveSession, endLiveSession } from '@/lib/live/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };
const flagOff = () => process.env.SUPERCARD_PROJECT_V1 !== '1';

/**
 * POST /api/project/:id/shoot-signal — SIGNAL de la salle de tournage multicaméra (VS4b).
 * Body { shot_id, type: 'action'|'cut'|'join'|'leave' }.
 *  - action/cut : le réalisateur déclenche/arrête TOUTES les cams en même temps (bus temps réel).
 *  - join       : entre dans la salle + SINGLE-LIVE (coupe les autres lives du user).
 *  - leave      : sort de la salle.
 * Le canal `shoot:<projet>:<plan>` est ISOLÉ (ne touche pas la SSE des conversations/appels).
 * NB : le déclenchement synchronise l'enregistrement LOCAL HD de chaque téléphone (le film reste HD ;
 * le flux vidéo « moniteur » compressé, lui, passe par le SFU — étape suivante).
 */
export async function POST(req: NextRequest, ctx: Ctx) {
  if (flagOff()) return NextResponse.json({ error: 'disabled' }, { status: 404 });
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await ctx.params;

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const shotId = typeof body.shot_id === 'string' ? body.shot_id : '';
  const type = String(body.type ?? '');
  if (!shotId || !['action', 'cut', 'join', 'leave'].includes(type)) {
    return NextResponse.json({ error: 'bad_signal', need: 'shot_id + type action|cut|join|leave' }, { status: 400 });
  }

  const channel = `shoot:${id}:${shotId}`;
  const roomId = `shoot_${id}_${shotId}`;

  // SINGLE-LIVE : entrer dans la salle coupe les autres lives de l'user (annonce / live user…).
  if (type === 'join') {
    endLiveSession(me.id); // ferme toute live ouverte du user
    startLiveSession(me.id, { username: me.username ?? '', display_name: me.display_name ?? null }, 'Tournage', 0, roomId);
  } else if (type === 'leave') {
    endLiveSession(me.id);
  }

  const n = publish(channel, {
    kind: 'activity_state',
    data: { shoot: type, by: me.id, at: Date.now() }, // 'by' = id OPAQUE, jamais de PII
  });
  return NextResponse.json({ ok: true, type, delivered: n });
}
