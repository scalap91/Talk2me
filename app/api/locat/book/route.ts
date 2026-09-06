/** LOCAT👀 — réserver + PAYER un bien à louer. POST {id, dates:[YYYY-MM-DD]}.
 *  Vérifie la dispo, puis lance le PAIEMENT ESCROW via startOrder (orderType 'location') :
 *  propriétaire + plateforme 3% (portée par le vendeur, acheteur gratuit), AUCUNE livraison.
 *  La réservation est CONFIRMÉE au règlement (markIntentPaid → confirmBooking). */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { areDatesFree, priceFor } from '@/lib/rental-calendar';
import { startOrder } from '@/lib/payments';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const id = String(b.id || '');
  const dates = Array.isArray(b.dates) ? b.dates.map((d) => String(d)).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)) : [];
  const msisdn = typeof b.msisdn === 'string' ? b.msisdn : null;
  if (!id || !dates.length) return NextResponse.json({ error: 'bad_request', need: 'id + dates' }, { status: 400 });

  const chk = areDatesFree(id, dates);
  if (!chk.ok || !chk.ownerId) return NextResponse.json({ error: 'dates_unavailable' }, { status: 409 });
  if (chk.ownerId === me.id) return NextResponse.json({ error: 'self' }, { status: 400 });
  const pr = priceFor(id, chk.dates);
  if (!pr || pr.totalCents <= 0) return NextResponse.json({ error: 'no_price' }, { status: 400 });

  // Caution CASH : collectée dans le MÊME escrow (part 'caution' au nom du locataire, SANS commission),
  // rendue au retour (RAS) ou captée par le propriétaire (dommage). Autres modes (empreinte…) : rien à encaisser.
  const cautionCents = pr.depositMode === 'cash' ? Math.max(0, Math.round(pr.deposit || 0)) : 0;

  const r = await startOrder({
    userId: me.id,
    amountCents: pr.totalCents,       // total location en Ariary (MGA = entier) — les 3% portent SUR le loyer seul
    currency: 'MGA',
    orderType: 'location',
    itemId: `locat:${id}`,
    sellerId: chk.ownerId,
    commissionFromSeller: true,       // acheteur gratuit, le propriétaire porte les 3% [[frais_paiement_acheteur_gratuit]]
    forceExternal: true,              // rail opérateur (PaPi) — comme la location voiture
    caution: cautionCents,            // ajoutée au montant prélevé APRÈS le devis (pas de 3% sur la caution)
    location: { item_id: id, dates: chk.dates, renter_id: me.id, owner_total_cents: pr.totalCents, caution_cents: cautionCents, deposit_mode: pr.depositMode },
    msisdn,
  });
  if (!r.ok) return NextResponse.json({ error: r.error || 'payment_failed' }, { status: 400 });
  return NextResponse.json({ ok: true, mode: r.mode, checkout_url: r.checkout_url ?? null, intent_id: r.intent?.id ?? null, total: pr.totalCents, days: chk.dates.length });
}
