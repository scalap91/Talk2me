/**
 * POST /api/ads/fund — financement RÉEL d'une campagne publicitaire (régie).
 * { amount_cents, title? } → crée un payment_intent purpose='ad' + lien PaPi hébergé.
 * L'annonceur paie SON budget (montant auto-choisi → pas de fraude possible) ; l'argent
 * va sur NOTRE compte PaPi (revenu pub). Réponse : { ok, checkout_url, intent_id }.
 * Statut sondé via /api/wallet/topup/status?intent=<id> (générique). MGA = Ariary entier.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { startAdFunding, currentProvider } from '@/lib/payments';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  let body: { amount_cents?: number; title?: string } = {};
  try { body = await req.json(); } catch { /* */ }
  const cents = Math.round(Number(body.amount_cents) || 0);
  if (!cents || cents < 300) return NextResponse.json({ error: 'amount_too_small' }, { status: 400 }); // PaPi min 300 Ar
  if (cents > 50_000_000) return NextResponse.json({ error: 'amount_too_large' }, { status: 400 });

  const r = await startAdFunding({ userId: me.id, amountCents: cents, title: body.title || null });
  if (!r.ok) return NextResponse.json({ error: r.error || 'ad_fund_failed', provider: currentProvider() }, { status: 400 });
  return NextResponse.json({ ok: true, checkout_url: r.checkout_url, intent_id: r.intent?.id, provider: currentProvider() });
}
