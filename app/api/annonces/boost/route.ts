/**
 * POST /api/annonces/boost { id, pack } — MET EN AVANT son annonce (premium), payé via PaPi.
 * Doctrine [[project_talk2me_payment_doctrine]] : encaissement opérateur, JAMAIS de wallet.
 * Packs définis SERVEUR (anti-triche). Au règlement (callback PaPi → markIntentPaid
 * purpose='boost'), boosted_until = now + durée → l'annonce remonte en tête du feed.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { listMyAnnonces } from '@/lib/annonces-deposit';
import { startBoost } from '@/lib/payments';
import { MARKET_CURRENCY } from '@/lib/money';
import { requireDesktopPayAuth } from '@/lib/pay-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DAY = 24 * 60 * 60 * 1000;
// Prix en Ariary (entier, pas de centimes). Ajustables.
export const BOOST_PACKS: Record<string, { ar: number; ms: number; label: string }> = {
  '7j': { ar: 5000, ms: 7 * DAY, label: '7 jours' },
  '15j': { ar: 9000, ms: 15 * DAY, label: '15 jours' },
  '30j': { ar: 15000, ms: 30 * DAY, label: '30 jours' },
};

export async function POST(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const b = await req.json().catch(() => ({} as Record<string, unknown>));
  const id = typeof b.id === 'string' ? b.id : '';
  const packKey = typeof b.pack === 'string' ? b.pack : '';
  const pack = BOOST_PACKS[packKey];
  if (!id || !pack) return NextResponse.json({ error: 'invalid_params' }, { status: 400 });

  // On ne booste QUE sa propre annonce.
  if (!listMyAnnonces(me.id).some((a) => a.id === id)) {
    return NextResponse.json({ error: 'not_owner' }, { status: 403 });
  }

  // STEP-UP DESKTOP : paiement depuis un ordinateur → validation mobile d'abord.
  const payAuthId = typeof b.pay_auth_id === 'string' ? b.pay_auth_id : null;
  const gate = requireDesktopPayAuth(req, me.id, { amountCents: pack.ar, currency: MARKET_CURRENCY, label: `Mise en avant ${pack.label}`, payAuthId });
  if (!gate.ok) return NextResponse.json({ ok: false, needs_mobile_auth: true, auth_id: gate.auth_id });

  const r = await startBoost({ userId: me.id, amountCents: pack.ar, msisdn: typeof b.msisdn === 'string' ? b.msisdn : null, annonceId: id, durationMs: pack.ms });
  if (!r.ok) return NextResponse.json({ error: r.error || 'payment_failed' }, { status: 400 });
  return NextResponse.json({ ok: true, checkout_url: r.checkout_url, intent_id: r.intent?.id });
}
