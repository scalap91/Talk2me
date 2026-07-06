/**
 * POST /api/pay-auth/approve { id, action? } — Mobile : valide (ou refuse) un
 * paiement desktop. SÉCURITÉ : une session WEB ne peut PAS valider (sinon le
 * step-up ne servirait à rien) → 403. Seul le téléphone (session native) valide.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { SESSION_COOKIE } from '@/lib/auth-constants';
import { isWebSession } from '@/lib/web-sessions';
import { approvePayAuth, denyPayAuth } from '@/lib/pay-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (isWebSession(req.cookies.get(SESSION_COOKIE)?.value || '')) {
    return NextResponse.json({ error: 'web_cannot_approve' }, { status: 403 });
  }
  const b = await req.json().catch(() => ({} as Record<string, unknown>));
  const id = typeof b.id === 'string' ? b.id : '';
  if (!id) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  if (b.action === 'deny') { denyPayAuth(me.id, id); return NextResponse.json({ ok: true, denied: true }); }
  const r = approvePayAuth(me.id, id);
  if (!r.ok) return NextResponse.json({ error: r.error || 'failed' }, { status: 400 });
  return NextResponse.json({ ok: true });
}
