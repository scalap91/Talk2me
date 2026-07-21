/**
 * Talk2Me — Déverrouillage d'un contenu payant du salon (photo/vidéo).
 * POST { item_id } :
 *   - déjà accessible (gratuit / le sien / VIP / déjà payé) → { ok, unlocked:true }
 *   - payant → startOrder(orderType:'content_unlock') = escrow + COMMISSION PLATEFORME + PaPi ;
 *     l'accès est octroyé À LA CONFIRMATION du paiement (lib/payments.ts → grantContentUnlock).
 * Même rail que l'entrée live (anti-désintermédiation : on ne bloque jamais le CONTACT,
 * on monétise le CONTENU premium). Devise MGA 1:1 (lib/money).
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { getSimpleShop, listItems } from '@/lib/simple-shop';
import { isVip, hasContentUnlock } from '@/lib/salon';
import { startOrder } from '@/lib/payments';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Params { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, ctx: Params) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await ctx.params;
  const shop = getSimpleShop(id);
  if (!shop || (shop.kind || '') !== 'rencontre') return NextResponse.json({ error: 'not_found' }, { status: 404 });

  let body: { item_id?: string } = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid_body' }, { status: 400 }); }
  const item = listItems(id).find((it) => it.id === body.item_id);
  if (!item) return NextResponse.json({ error: 'item_not_found' }, { status: 404 });

  const price = item.price_cents || 0;
  // Déjà accessible → rien à payer.
  if (price <= 0 || shop.owner_id === me.id || isVip(shop.owner_id, me.id) || hasContentUnlock(item.id, me.id)) {
    return NextResponse.json({ ok: true, unlocked: true });
  }
  if (shop.owner_id === me.id) return NextResponse.json({ error: 'own_content' }, { status: 400 });

  const order = await startOrder({
    userId: me.id, amountCents: price, currency: 'MGA',
    orderType: 'content_unlock', itemId: item.id, sellerId: shop.owner_id,
  });
  if (!order.ok) return NextResponse.json({ error: order.error || 'order_failed' }, { status: 400 });
  // intent_id : le client natif (PaPiCheckout) poll /api/wallet/topup/status?intent=… pour savoir quand c'est payé.
  return NextResponse.json({ ok: true, unlocked: order.mode === 'paid', checkout_url: order.checkout_url || null, intent_id: order.intent?.id || null });
}
