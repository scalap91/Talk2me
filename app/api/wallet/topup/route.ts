/**
 * POST /api/wallet/topup (Pascal 2026-06-15) — recharge RÉELLE du wallet.
 * { amount_cents, msisdn? } → crée un payment_intent + démarre le paiement chez
 * le fournisseur (sandbox pour l'instant ; MVola quand les clés seront posées).
 * Réponse : { ok, checkout_url } — le client ouvre l'URL pour payer.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { startTopup, currentProvider } from '@/lib/payments';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  let body: { amount_cents?: number; msisdn?: string } = {};
  try { body = await req.json(); } catch { /* */ }
  const cents = Math.round(Number(body.amount_cents) || 0);
  if (!cents || cents < 100) return NextResponse.json({ error: 'amount_too_small' }, { status: 400 });
  if (cents > 5_000_000) return NextResponse.json({ error: 'amount_too_large' }, { status: 400 });

  const r = await startTopup({ userId: me.id, amountCents: cents, msisdn: body.msisdn || null });
  if (!r.ok) return NextResponse.json({ error: r.error || 'topup_failed', provider: currentProvider() }, { status: 400 });
  return NextResponse.json({ ok: true, checkout_url: r.checkout_url, intent_id: r.intent?.id, provider: currentProvider() });
}
