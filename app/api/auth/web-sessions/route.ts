/**
 * Ordinateurs connectés (sessions web liées par QR). Pascal 2026-06-26, sécurité.
 *  GET                 → mes ordinateurs connectés (IP, date) + lequel est l'actuel.
 *  DELETE { pub_id }   → déconnecter un ordinateur (révoque sa session).
 *  DELETE { all:true } → déconnecter TOUS les ordinateurs.
 * Auth requise (l'user gère SES propres sessions).
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { SESSION_COOKIE } from '@/lib/auth-constants';
import { listWebSessions, revokeWebSession } from '@/lib/web-sessions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const cur = req.cookies.get(SESSION_COOKIE)?.value || '';
  return NextResponse.json({ ok: true, sessions: listWebSessions(me.id, cur) });
}

export async function DELETE(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const b = await req.json().catch(() => ({} as Record<string, unknown>));
  if (b.all === true) {
    for (const s of listWebSessions(me.id, '')) revokeWebSession(me.id, s.pub_id);
    return NextResponse.json({ ok: true });
  }
  const pubId = typeof b.pub_id === 'string' ? b.pub_id : '';
  if (!pubId) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  const ok = revokeWebSession(me.id, pubId);
  return NextResponse.json({ ok });
}
