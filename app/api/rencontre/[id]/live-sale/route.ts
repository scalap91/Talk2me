/**
 * Talk2Me — « Vendre cette vidéo dans mon live » (Pascal 2026-07-15).
 * POST { item_id, on } (owner only) : (dé)marque une vidéo PAYANTE du salon comme vendue
 * pendant le live de l'hôte. Elle apparaîtra à l'achat dans sa salle (/live/[host]).
 * L'achat réutilise le rail content_unlock (escrow + commission) → puis la vidéo se regarde.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { getSimpleShop, listItems } from '@/lib/simple-shop';
import { setLiveSaleVideo } from '@/lib/salon';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Params { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, ctx: Params) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await ctx.params;
  const shop = getSimpleShop(id);
  if (!shop || shop.owner_id !== me.id) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  let body: { item_id?: string; on?: boolean } = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid_body' }, { status: 400 }); }
  const item = listItems(id).find((it) => it.id === body.item_id);
  if (!item) return NextResponse.json({ error: 'item_not_found' }, { status: 404 });
  if ((item.price_cents || 0) <= 0) return NextResponse.json({ error: 'not_paid' }, { status: 400 }); // seule une vidéo PAYANTE se vend
  // host_user_id de la salle = l'owner (la salle live est indexée par user id).
  setLiveSaleVideo(shop.owner_id, item.id, body.on !== false);
  return NextResponse.json({ ok: true });
}
