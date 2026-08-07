/**
 * POST /api/commerce/buy (Pascal 2026-06-23) — ACHAT PROTÉGÉ unifié.
 *
 * Prix + vendeur résolus CÔTÉ SERVEUR (lib/commerce-resolve). startOrder calcule le
 * TOTAL payé par l'acheteur (article + commission T2M + frais PaPi + livraison) et
 * lance l'achat protégé (escrow) : solde wallet → bloqué direct ; sinon paiement
 * (PaPi/MVola) → escrow financé au callback.
 * Body : { type:'boutique'|'plat'|'annonce', shop_id?, shop_key?, item_id?, items?, annonce_id?, msisdn? }
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { startOrder } from '@/lib/payments';
import { resolveOrderTarget } from '@/lib/commerce-resolve';
import { resolveDelivery } from '@/lib/commerce-pricing';
import { requireDesktopPayAuth } from '@/lib/pay-auth';
import { getDb } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MARKET_CURRENCY = process.env.MARKET_CURRENCY || 'MGA';

/** Résout le point de RETRAIT choisi : 'shop:<id>' → dépôt du vendeur (= origine boutique) ;
 *  'carrier:<uid>' → dépôt d'un transporteur vérifié. Défaut = dépôt vendeur. */
function resolvePickupAgency(agencyId: string | undefined, shopLat: number | null, shopLng: number | null): { lat: number | null; lng: number | null; label: string } {
  if (agencyId && agencyId.startsWith('carrier:')) {
    try {
      const uid = agencyId.slice('carrier:'.length);
      const r = getDb().prepare("SELECT depot_lat AS lat, depot_lng AS lng, depot_label AS label FROM transport_profile WHERE user_id=? AND cni_status='verified'").get(uid) as { lat: number | null; lng: number | null; label: string | null } | undefined;
      if (r && r.lat != null && r.lng != null) return { lat: r.lat, lng: r.lng, label: r.label || 'Agence de retrait' };
    } catch { /* dépôt introuvable → repli vendeur */ }
  }
  return { lat: shopLat, lng: shopLng, label: 'Retrait chez le vendeur' };
}

export async function POST(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  let body: { type?: string; channel?: string; shop_id?: string; shop_key?: string; item_id?: string; items?: { item_id: string; qty?: number }[]; annonce_id?: string; msisdn?: string; lat?: number; lng?: number; force_external?: boolean; pay_auth_id?: string; service_mode?: string; landmark?: string; delivery_phone?: string; agency_id?: string } = {};
  try { body = await req.json(); } catch { /* */ }

  // Card OS : garde-fou — un appelant peut passer le `channel` (switch de la card) ;
  // on le mappe vers le `type` attendu. `type` explicite reste prioritaire.
  if (!body.type && body.channel) {
    body.type = body.channel === 'eat' ? 'plat' : body.channel === 'annonce' ? 'annonce' : 'boutique';
  }

  const t = resolveOrderTarget(body);
  if (!t.ok) return NextResponse.json({ error: t.error }, { status: t.status || 400 });
  if (!t.priceCents || t.priceCents <= 0) return NextResponse.json({ error: 'price_unset' }, { status: 400 });

  // STEP-UP DESKTOP : un paiement lancé depuis un ordinateur (session web) exige une
  // validation sur le mobile AVANT d'atteindre la page de paiement. Mobile natif = direct.
  const payLabel = body.type === 'rental' ? 'Location' : body.type === 'boutique' ? 'Achat boutique' : body.type === 'plat' ? 'Commande' : 'Achat';
  const gate = requireDesktopPayAuth(req, me.id, { amountCents: t.priceCents, currency: MARKET_CURRENCY, label: payLabel, payAuthId: body.pay_auth_id });
  if (!gate.ok) return NextResponse.json({ ok: false, needs_mobile_auth: true, auth_id: gate.auth_id });

  // SERVICE (Phase 3 livraison / Phase 4 retrait). Au paiement, on crée le colis Drive :
  //  - LIVRAISON : dépôt vendeur → épingle client (repère + tél) ; frais = devis haversine.
  //  - RETRAIT : dépôt vendeur OU dépôt transporteur choisi → 0 frais + code de retrait (click-and-collect).
  const isDelivery = (body.service_mode || 'livraison') === 'livraison';
  const deliveryCents = isDelivery ? resolveDelivery(t, body.lat, body.lng) : 0;
  let delivery: import('@/lib/payments').OrderContext['delivery'] | undefined;
  if (isDelivery && body.lat != null && body.lng != null) {
    delivery = { mode: 'livraison', o_lat: t.originLat ?? undefined, o_lng: t.originLng ?? undefined, o_label: 'Dépôt vendeur', d_lat: body.lat, d_lng: body.lng, landmark: (body.landmark || '').slice(0, 120) || undefined, phone: (body.delivery_phone || '').slice(0, 30) || undefined, product_label: 'Commande boutique' };
  } else if (body.service_mode === 'retrait') {
    // Résolution de l'agence de retrait choisie ('shop:<id>' = chez le vendeur ; 'carrier:<uid>' = dépôt transporteur).
    const pick = resolvePickupAgency(body.agency_id, t.originLat ?? null, t.originLng ?? null);
    delivery = { mode: 'retrait', o_lat: pick.lat ?? undefined, o_lng: pick.lng ?? undefined, o_label: pick.label, d_lat: pick.lat ?? undefined, d_lng: pick.lng ?? undefined, agency_id: body.agency_id, product_label: 'Commande boutique' };
  }

  const r = await startOrder({
    userId: me.id,
    amountCents: t.priceCents,
    currency: MARKET_CURRENCY,
    msisdn: body.msisdn || null,
    orderType: body.type || '',
    itemId: t.itemId || '',
    sellerId: t.sellerId || '',
    shopId: body.shop_id || null, // boutique .card → référent = commission terrain
    lines: t.lines, // lignes réelles (item+qté) → décrément stock + « vendus » sur la card

    deliveryCents,
    dropship: !!t.dropship, // affiliation : commission promoteur au paiement (Audit #56)
    forceExternal: !!body.force_external, // doctrine : paiement PaPi (pas le wallet)
    delivery,
  });
  if (!r.ok) return NextResponse.json({ error: r.error || 'order_failed' }, { status: 400 });
  return NextResponse.json({
    ok: true,
    mode: r.mode,                 // 'paid' (escrow bloqué via solde) | 'pay' (paiement en cours)
    escrow_id: r.escrow_id,
    intent_id: r.intent?.id,
    checkout_url: r.checkout_url,  // null si push USSD
    currency: MARKET_CURRENCY,
    quote: r.quote,               // détail : article + commission + frais PaPi + total
    pickup_code: r.pickup_code,   // RETRAIT payé au solde : code à présenter au point de retrait
  });
}
