/**
 * GET /api/pay-auth/pending — Mobile : mes demandes de paiement à valider.
 * Renvoie aussi `can_approve` = false si la session courante est WEB (un PC ne
 * peut PAS valider son propre paiement → il faut le téléphone).
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { SESSION_COOKIE } from '@/lib/auth-constants';
import { isWebSession } from '@/lib/web-sessions';
import { listPendingPayAuths } from '@/lib/pay-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const web = isWebSession(req.cookies.get(SESSION_COOKIE)?.value || '');
  const pending = listPendingPayAuths(me.id).map((a) => ({ id: a.id, amount_cents: a.amount_cents, currency: a.currency, label: a.label, created_at: a.created_at }));
  return NextResponse.json({ ok: true, can_approve: !web, pending });
}
