/**
 * GET /api/payments/sandbox/confirm?intent=ID (Pascal 2026-06-15)
 * SANDBOX uniquement : simule un paiement réussi → marque l'intent payé →
 * crédite le wallet → redirige vers /wallet. Sert à tester le rail de bout en
 * bout SANS argent réel. En prod (MVola), c'est le webhook du fournisseur qui
 * confirme, pas cette route.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { getIntent, markIntentPaid, currentProvider } from '@/lib/payments';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.redirect(new URL('/signin', req.url));
  if (currentProvider() !== 'sandbox') return NextResponse.json({ error: 'not_sandbox' }, { status: 400 });
  const id = req.nextUrl.searchParams.get('intent') || '';
  const intent = getIntent(id);
  if (!intent || intent.user_id !== me.id) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  markIntentPaid(id, 'sandbox-' + id.slice(0, 8));
  return NextResponse.redirect(new URL('/wallet?topup=ok', req.url));
}
