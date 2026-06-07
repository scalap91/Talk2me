/**
 * POST /api/activities/[id]/sync
 *
 * Talk2Me #408 (Pascal 2026-06-05) — Watch Together event passthrough.
 *
 * Doctrine [[talk2me-watch-together-passthrough]] :
 *   "Le payload réseau contient UNIQUEMENT des events de contrôle :
 *    {action: 'play'}, {action: 'seek', time: 754}, {action: 'pause'},
 *    {action: 'rate', value: 1.25}."
 *
 * Le leader pousse ses events player ici. On les broadcast immédiatement
 * au peer via 'watch_sync' (le peer les applique à son propre player).
 * Aucun media n'est jamais transporté par Talk2Me.
 *
 * Body : { action: 'play'|'pause'|'seek'|'rate', time: number, rate?: number, client_ts: number }
 *
 * Sécurité : participant only ; activité doit être 'accepted'.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { userCanAccessActivity } from '@/lib/db';
import { publish } from '@/lib/realtime-bus';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Params {
  params: Promise<{ id: string }>;
}

const VALID_ACTIONS = new Set(['play', 'pause', 'seek', 'rate']);

export async function POST(request: NextRequest, ctx: Params) {
  const me = getCurrentUserFromRequest(request);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { id } = await ctx.params;
  const access = userCanAccessActivity(id, me.id);
  if (!access) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  if (access.activity.invite_status !== 'accepted') {
    return NextResponse.json(
      { error: 'activity_not_accepted', invite_status: access.activity.invite_status },
      { status: 409 },
    );
  }

  let body: {
    action?: unknown;
    time?: unknown;
    rate?: unknown;
    client_ts?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  const action = typeof body.action === 'string' ? body.action : '';
  if (!VALID_ACTIONS.has(action)) {
    return NextResponse.json({ error: 'invalid_action' }, { status: 400 });
  }
  const time = typeof body.time === 'number' && Number.isFinite(body.time) ? body.time : 0;
  const rate =
    typeof body.rate === 'number' && Number.isFinite(body.rate) ? body.rate : null;
  const clientTs =
    typeof body.client_ts === 'number' && Number.isFinite(body.client_ts)
      ? body.client_ts
      : Date.now();

  publish(`conv:${access.convId}`, {
    kind: 'watch_sync',
    data: {
      conversation_id: access.convId,
      activity_id: id,
      action,
      time,
      rate,
      client_ts: clientTs,
      server_ts: Date.now(),
      from_user_id: me.id,
    },
  });

  return NextResponse.json({ ok: true });
}
