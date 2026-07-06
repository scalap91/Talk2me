/**
 * GET  /api/import-orders — mes commandes d'import (suivi client).
 * POST /api/import-orders { client_name, mada_address, mada_phone?, product_title, product_url?,
 *       product_image?, variant?, qty?, source? } — crée une commande d'import (achat SHEIN/TEMU
 *       puis acheminement Mada via le transporteur). Le paiement réel se branchera ensuite.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { createImportOrder, listMyImportOrders } from '@/lib/import-orders';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  return NextResponse.json({ ok: true, orders: listMyImportOrders(me.id) });
}

export async function POST(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const b = await req.json().catch(() => ({} as Record<string, unknown>));
  const s = (k: string) => (typeof b[k] === 'string' ? (b[k] as string) : '');
  const order = createImportOrder(me.id, {
    clientName: s('client_name'), madaAddress: s('mada_address'), madaPhone: s('mada_phone') || null,
    source: s('source') || 'SHEIN', productTitle: s('product_title'), productUrl: s('product_url') || null,
    productImage: s('product_image') || null, variant: s('variant') || null,
    qty: typeof b.qty === 'number' ? b.qty : parseInt(s('qty') || '1', 10) || 1,
    productPriceCents: typeof b.product_price_cents === 'number' ? b.product_price_cents : null,
    note: s('note') || null,
  });
  if (!order) return NextResponse.json({ error: 'invalid' }, { status: 400 });
  return NextResponse.json({ ok: true, order });
}
