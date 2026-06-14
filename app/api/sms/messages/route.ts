/** SMS Talk — GET un thread (?with=<userId>) · POST envoyer ({to, text}).
 *  `to` = talk2me_id OU username. Couche communication (pas d'ami T2M, pas de L2). */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { getSmsThread, sendSmsTalk, getUserByTalk2MeId, getUserByUsername, getUserById } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const otherId = req.nextUrl.searchParams.get('with') || '';
  if (!otherId || !getUserById(otherId)) return NextResponse.json({ error: 'no_peer' }, { status: 400 });
  return NextResponse.json({ ok: true, ...getSmsThread(me.id, otherId) });
}

export async function POST(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { to?: string; to_id?: string; text?: string };
  const text = typeof body.text === 'string' ? body.text : '';
  // Cible : par id direct, sinon par talk2me_id, sinon par username.
  let recipient = body.to_id ? getUserById(body.to_id) : null;
  if (!recipient && typeof body.to === 'string' && body.to.trim()) {
    const q = body.to.trim().replace(/^@/, '');
    recipient = getUserByTalk2MeId(q) || getUserByUsername(q);
  }
  if (!recipient) return NextResponse.json({ error: 'recipient_not_found' }, { status: 404 });
  const res = sendSmsTalk(me.id, recipient.id, text);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
  return NextResponse.json({ ok: true, id: res.id, peer_id: recipient.id });
}
