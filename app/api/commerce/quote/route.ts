/**
 * POST /api/commerce/quote (Pascal 2026-06-24) — DEVIS d'achat (sans débit).
 * Même résolution serveur que /buy, renvoie le détail payé par l'acheteur :
 * article (→ vendeur) + commission T2M + frais PaPi + livraison = total.
 * Sert à AFFICHER le décompte avant de confirmer l'achat.
 * Body : { type, shop_id?, shop_key?, item_id?, items?, annonce_id? }
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { resolveOrderTarget } from '@/lib/commerce-resolve';
import { quoteOrder, resolveDelivery } from '@/lib/commerce-pricing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MARKET_CURRENCY = process.env.MARKET_CURRENCY || 'MGA';

export async function POST(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  let body: { type?: string; shop_id?: string; shop_key?: string; item_id?: string; items?: { item_id: string; qty?: number }[]; annonce_id?: string; lat?: number; lng?: number } = {};
  try { body = await req.json(); } catch { /* */ }

  const t = resolveOrderTarget(body);
  if (!t.ok) return NextResponse.json({ error: t.error }, { status: t.status || 400 });
  if (!t.priceCents || t.priceCents <= 0) return NextResponse.json({ error: 'price_unset' }, { status: 400 });

  const delivery = resolveDelivery(t, body.lat, body.lng);
  return NextResponse.json({ ok: true, currency: MARKET_CURRENCY, quote: quoteOrder(t.priceCents, delivery) });
}
