/**
 * POST /api/calls/new — Calls v2 tonalité honnête (Talk2Me #418).
 *
 * Pascal 2026-06-05 — Module appels avec heartbeat ring_beat envoyé par
 * l'appelé. Doctrine [[talk2me-calls-architecture]] + [[modular-no-scattered-
 * patches]].
 *
 * Body: { callee_id: string, kind: 'audio'|'video', conv_id?: string }
 *
 * 1. Refuse si pas amis (anti-spam, anti-cold-call).
 * 2. Refuse si callee a déjà un appel actif (busy upstream).
 * 3. Refuse si caller a déjà un appel actif (un seul appel à la fois).
 * 4. Crée le call state='ringing'.
 * 5. Broadcast 'call:incoming' sur user:{callee_id}.
 * 6. Retour { call_id, expires_at } (expire = no_answer auto-hangup ~30s).
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import {
  createCall,
  getUserById,
  getActiveCallsForUser,
  isCommBlocked,
  upsertCommContact,
  getUserByTalk2MeId,
  getUserByUsername,
} from '@/lib/db';
import { publish } from '@/lib/realtime-bus';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Délai max avant qu'un appel non-décroché soit auto-hangup en no_answer (ms). */
const CALL_RING_TIMEOUT_MS = 45_000;

export async function POST(request: NextRequest) {
  const me = getCurrentUserFromRequest(request);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let body: { callee_id?: unknown; kind?: unknown; conv_id?: unknown; layer?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  let calleeId = typeof body.callee_id === 'string' ? body.callee_id.trim() : '';
  // Call Talk : on peut composer un talk2me_id ou @pseudo (body.to).
  if (!calleeId && typeof (body as { to?: unknown }).to === 'string') {
    const q = ((body as { to?: string }).to || '').trim().replace(/^@/, '');
    const u = q ? getUserByTalk2MeId(q) || getUserByUsername(q) : null;
    if (u) calleeId = u.id;
  }
  const kind = body.kind === 'video' ? 'video' : 'audio';
  const convId = typeof body.conv_id === 'string' ? body.conv_id.trim() : null;
  if (!calleeId) {
    return NextResponse.json({ error: 'callee_id_required' }, { status: 400 });
  }
  if (calleeId === me.id) {
    return NextResponse.json({ error: 'cannot_call_self' }, { status: 400 });
  }

  const callee = getUserById(calleeId);
  if (!callee) {
    return NextResponse.json({ error: 'callee_not_found' }, { status: 404 });
  }

  // APPELS NON RESTREINTS (Pascal 2026-06-08) : tout le monde peut appeler tout
  // le monde (ami ou pas — le système sait, mais ça ne bloque pas l'appel). La
  // SEULE barrière = le blocage (anti-spam). La restriction "amis" vit sur le
  // CHAT (T2M social) et le Hub social, JAMAIS sur les appels.
  if (isCommBlocked(calleeId, me.id)) {
    return NextResponse.json({ error: 'blocked' }, { status: 403 });
  }
  // Carnet comm des deux côtés (aucune amitié T2M créée).
  upsertCommContact(me.id, calleeId, 'call');
  upsertCommContact(calleeId, me.id, 'call');

  // Si l'appelé est déjà dans un appel actif → busy upstream.
  const calleeActive = getActiveCallsForUser(calleeId);
  if (calleeActive.length > 0) {
    return NextResponse.json(
      { error: 'callee_busy', call_id: null },
      { status: 409 }
    );
  }

  // Si l'appelant est déjà dans un appel → conflit (doit raccrocher d'abord).
  const callerActive = getActiveCallsForUser(me.id);
  if (callerActive.length > 0) {
    return NextResponse.json(
      { error: 'caller_already_in_call', call_id: callerActive[0].id },
      { status: 409 }
    );
  }

  const call = createCall({
    caller_id: me.id,
    callee_id: calleeId,
    conv_id: convId,
    kind,
  });

  // Broadcast 'call:incoming' au user destinataire.
  publish(`user:${calleeId}`, {
    kind: 'call:incoming',
    data: {
      call_id: call.id,
      kind: call.kind,
      conv_id: call.conv_id,
      started_at: call.started_at,
      caller: {
        id: me.id,
        username: me.username,
        display_name: me.display_name,
        avatar_url: me.avatar_url,
      },
    },
  });

  return NextResponse.json({
    ok: true,
    call_id: call.id,
    expires_at: call.started_at + CALL_RING_TIMEOUT_MS,
    callee: {
      id: callee.id,
      username: callee.username,
      display_name: callee.display_name,
      avatar_url: callee.avatar_url,
      ai_avatar_url: callee.ai_avatar_url,
    },
  });
}
