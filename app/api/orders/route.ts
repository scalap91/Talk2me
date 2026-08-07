import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { listBuyerOrders } from '@/lib/escrow';
import { getArticleDotcardsByIds } from '@/lib/simple-shop';

/**
 * Talk2Me — MES COMMANDES (Pascal 2026-08-05). L'index des achats de l'acheteur : les escrows
 * où JE suis buyer (étape 1 : chacun porte card_id/order_type), enrichis du `.card` acheté
 * (lu par le lecteur unique côté page). Une seule requête + un batch de dotcards. Le nominatif
 * reste privé : je ne vois QUE mes commandes.
 */
export const dynamic = 'force-dynamic';

export function GET(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const orders = listBuyerOrders(me.id);
  const ids = orders.map((o) => o.card_id).filter((x): x is string => !!x && !x.startsWith('cart:'));
  const cards = new Map(getArticleDotcardsByIds(ids).map((r) => [r.id, r.dotcard]));

  const out = orders.map((o) => {
    let card: unknown = null;
    const dc = o.card_id ? cards.get(o.card_id) : null;
    if (dc) { try { card = JSON.parse(dc); } catch { /* dotcard illisible → carte nulle */ } }
    return { ...o, card };
  });

  return NextResponse.json({ orders: out });
}
