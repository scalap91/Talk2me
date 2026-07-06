/**
 * GET /api/auth/qr/status?t=<token> — Desktop : poll de l'appairage. Quand le
 * mobile a approuvé, on LIVRE le cookie de session (Set-Cookie) une seule fois
 * et on renvoie { status:'approved' } → le client recharge vers /home. Public.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getLinkToken, consumeApprovedSession } from '@/lib/web-link';
import { SESSION_COOKIE, sessionCookieAttrs } from '@/lib/auth-constants';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('t') || '';
  const row = getLinkToken(token);
  if (!row) return NextResponse.json({ status: 'unknown' });
  if (row.expires_at <= Date.now() && row.status === 'pending') return NextResponse.json({ status: 'expired' });

  if (row.status === 'approved') {
    const sessionToken = consumeApprovedSession(token);
    if (sessionToken) {
      const res = NextResponse.json({ status: 'approved' });
      res.headers.set('Set-Cookie', `${SESSION_COOKIE}=${sessionToken}; ${sessionCookieAttrs()}`);
      return res;
    }
  }
  // 'consumed' = déjà livré (un autre onglet a pris le cookie) → traité comme prêt.
  if (row.status === 'consumed') return NextResponse.json({ status: 'approved' });
  return NextResponse.json({ status: 'pending' });
}
