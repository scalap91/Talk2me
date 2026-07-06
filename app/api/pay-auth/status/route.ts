/**
 * GET /api/pay-auth/status?id= — Desktop : poll de l'autorisation de paiement.
 * Renvoie { status: pending|approved|consumed|denied|expired|unknown }.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { getPayAuth } from '@/lib/pay-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const id = req.nextUrl.searchParams.get('id') || '';
  const a = getPayAuth(id);
  if (!a || a.user_id !== me.id) return NextResponse.json({ status: 'unknown' });
  if (a.status === 'pending' && a.expires_at <= Date.now()) return NextResponse.json({ status: 'expired' });
  return NextResponse.json({ status: a.status });
}
