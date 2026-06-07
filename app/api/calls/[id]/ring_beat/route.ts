/**
 * POST /api/calls/[id]/ring_beat — Heartbeat tonalité honnête (Talk2Me #418).
 *
 * Émis par l'app de l'APPELÉ à chaque cycle de sonnerie (~1.2s).
 * Le serveur relaie 1 event 'call:ring_beat' à l'appelant → un cycle de
 * dring est joué localement chez lui. Si plus de beat → le watchdog côté
 * appelant passe en mode busy.
 *
 * Anti-spoof :
 *  - Seul le callee_id de l'appel peut POST
 *  - Refusé si state != 'ringing'
 *
 * Anti-flood : rate limit 1.5 beats/s par appel (in-memory).
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { getCallById, updateCallRingBeat } from '@/lib/db';
import { publish } from '@/lib/realtime-bus';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Rate limit : 1 beat min / 666ms (= 1.5 max par seconde).
const BEAT_MIN_INTERVAL_MS = 666;

interface BeatStore {
  // call_id → last server-side accepted beat timestamp
  last: Map<string, number>;
}
function store(): BeatStore {
  const g = globalThis as unknown as { __ttmRingBeatRL?: BeatStore };
  if (!g.__ttmRingBeatRL) g.__ttmRingBeatRL = { last: new Map() };
  return g.__ttmRingBeatRL;
}

interface Params {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, ctx: Params) {
  const me = getCurrentUserFromRequest(request);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { id } = await ctx.params;
  const call = getCallById(id);
  if (!call) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  // Anti-spoof
  if (call.callee_id !== me.id) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  if (call.state !== 'ringing') {
    return NextResponse.json({ error: 'invalid_state', state: call.state }, { status: 409 });
  }

  // Rate limit
  const now = Date.now();
  const s = store();
  const last = s.last.get(id) || 0;
  if (now - last < BEAT_MIN_INTERVAL_MS) {
    return NextResponse.json({ error: 'too_fast' }, { status: 429 });
  }
  s.last.set(id, now);

  updateCallRingBeat(id, now);

  // Relais → appelant
  publish(`user:${call.caller_id}`, {
    kind: 'call:ring_beat',
    data: { call_id: id, at: now },
  });

  return NextResponse.json({ ok: true });
}
