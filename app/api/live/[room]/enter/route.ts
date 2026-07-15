/**
 * /api/live/[room]/enter — PAYWALL d'entrée dans une salle live (Pascal 2026-07-15).
 * `room` = id du DIFFUSEUR (host), même convention que le reste de /api/live/[room].
 *  - GET  → { live, priceCents, hasAccess } : état pour afficher le paywall.
 *  - POST → si gratuit ou déjà payé : octroie + { ok, access:true }.
 *           sinon : startOrder(orderType 'live_entry') → { checkout_url } (paiement PaPi,
 *           l'accès est octroyé à la CONFIRMATION du paiement, cf. lib/payments markIntentPaid).
 * Rail vérifié : escrow + commission plateforme. MGA = 1:1.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { getLiveEntryInfo, hasLiveEntry, grantLiveEntry } from '@/lib/live/session';
import { startOrder } from '@/lib/payments';
import { MARKET_CURRENCY } from '@/lib/money';
import { requireDesktopPayAuth } from '@/lib/pay-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, ctx: { params: Promise<{ room: string }> }) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { room: host } = await ctx.params;
  const info = getLiveEntryInfo(host);
  if (!info) return NextResponse.json({ ok: true, live: false });
  return NextResponse.json({ ok: true, live: true, priceCents: info.priceCents, hasAccess: hasLiveEntry(host, me.id) });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ room: string }> }) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { room: host } = await ctx.params;
  const info = getLiveEntryInfo(host);
  if (!info) return NextResponse.json({ ok: false, error: 'not_live' }, { status: 404 });

  // Déjà l'accès (hôte, ou déjà payé) OU entrée gratuite → on octroie et on entre.
  if (host === me.id || hasLiveEntry(host, me.id) || info.priceCents <= 0) {
    grantLiveEntry(host, me.id, info.sessionId);
    return NextResponse.json({ ok: true, access: true });
  }

  let body: { msisdn?: string; pay_auth_id?: string } = {};
  try { body = await req.json(); } catch { /* */ }

  const gate = requireDesktopPayAuth(req, me.id, { amountCents: info.priceCents, currency: MARKET_CURRENCY, label: 'Entrée live', payAuthId: body.pay_auth_id });
  if (!gate.ok) return NextResponse.json({ ok: false, needs_mobile_auth: true, auth_id: gate.auth_id });

  const r = await startOrder({
    userId: me.id,
    amountCents: info.priceCents,
    currency: MARKET_CURRENCY,
    msisdn: body.msisdn || null,
    orderType: 'live_entry',
    itemId: info.sessionId, // = session → sert à octroyer l'accès à la confirmation
    sellerId: host,
    forceExternal: true,
  });
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error || 'order_failed' }, { status: 400 });
  return NextResponse.json({ ok: true, access: false, mode: r.mode, checkout_url: r.checkout_url, currency: MARKET_CURRENCY, quote: r.quote });
}
