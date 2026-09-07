/**
 * Talk2Me — ACHAT d'une CARD MÉDIA (album / film) = bien numérique. Pascal 2026-09-07.
 * POST { id } :
 *   - déjà accessible (le sien / déjà acheté) → { ok, unlocked:true }
 *   - payant → startOrder(orderType:'content_unlock') = escrow + COMMISSION PLATEFORME + PaPi ;
 *     l'accès est octroyé À LA CONFIRMATION du paiement (lib/payments.ts → grantContentUnlock),
 *     donc côté SERVEUR → la lecture complète se débloque sur TOUS les appareils (jamais un
 *     `_bought` local). MÊME rail que le salon (rencontre/unlock) et l'entrée live.
 *
 * SOURCE DE VÉRITÉ = le fichier `.card` (readCardFileRaw) : prix (`price.amount`) + owner + types.
 * La colonne `dotcard` en base est un index qui peut être périmé → on ne s'en sert JAMAIS ici.
 * Devise de charge = MGA (money 1:1) ; €/$ convertis (mêmes taux que commerce-resolve).
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { readCardFileRaw } from '@/lib/cards/card-file';
import { parseCard } from '@/lib/cards/supercard';
import { hasContentUnlock } from '@/lib/salon';
import { startOrder } from '@/lib/payments';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const EUR_TO_MGA = Math.max(1, Math.round(Number(process.env.EUR_TO_MGA_RATE) || 5000));
const USD_TO_MGA = Math.max(1, Math.round(Number(process.env.USD_TO_MGA_RATE) || 4600));

/** price du `.card` → montant MGA (entier). Album/film sont libellés en Ar ; €/$ convertis. */
function priceToMga(price: { amount?: number; currency?: string } | undefined): number {
  if (!price) return 0;
  const n = Math.max(0, Number(price.amount) || 0);
  if (n <= 0) return 0;
  const cur = String(price.currency || '').toLowerCase();
  if (cur.includes('eur') || cur.includes('€')) return Math.round(n * EUR_TO_MGA);
  if (cur.includes('usd') || cur.includes('$')) return Math.round(n * USD_TO_MGA);
  return Math.round(n); // Ar / MGA = entier (pas de ×100), convention money.ts
}

export async function POST(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let body: { id?: string } = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid_body' }, { status: 400 }); }
  const id = (body.id || '').trim();
  if (!id) return NextResponse.json({ error: 'id_required' }, { status: 400 });

  const raw = await readCardFileRaw(id);
  if (!raw) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const parsed = parseCard(raw);
  if (!parsed.ok || !parsed.card) return NextResponse.json({ error: 'unreadable' }, { status: 404 });
  const card = parsed.card;
  const types = card.types || [];

  // Bien numérique achetable = album ou film (musique / œuvre). Rien d'autre ne passe par ce rail.
  if (!types.includes('album') && !types.includes('film')) {
    return NextResponse.json({ error: 'not_buyable' }, { status: 400 });
  }

  const sellerId = card.owner || '';
  if (!sellerId) return NextResponse.json({ error: 'no_owner' }, { status: 400 });

  // Le sien → déjà accessible (on n'achète JAMAIS sa propre création).
  if (sellerId === me.id) return NextResponse.json({ ok: true, unlocked: true, own: true });
  // Déjà acheté → rien à repayer.
  if (hasContentUnlock(id, me.id)) return NextResponse.json({ ok: true, unlocked: true });

  const priceCents = priceToMga(card.price);
  if (priceCents <= 0) return NextResponse.json({ error: 'price_unset' }, { status: 400 });

  // Achat protégé (escrow + commission plateforme). content_unlock → grantContentUnlock au paiement.
  const order = await startOrder({
    userId: me.id, amountCents: priceCents, currency: 'MGA',
    orderType: 'content_unlock', itemId: id, sellerId,
  });
  if (!order.ok) return NextResponse.json({ error: order.error || 'order_failed' }, { status: 400 });

  // intent_id : le client (web CheckoutSheet / natif PaPiCheckout) poll
  // /api/wallet/topup/status?intent=… pour savoir quand c'est payé, puis relit le feed (bought:true).
  return NextResponse.json({
    ok: true,
    unlocked: order.mode === 'paid',
    checkout_url: order.checkout_url || null,
    intent_id: order.intent?.id || null,
  });
}
