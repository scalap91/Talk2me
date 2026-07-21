/**
 * Talk2Me — LIVE SHOPPING · /api/live/[room]/product  (Pascal 2026-07-05)
 * room = liveId = id du DIFFUSEUR. Le vendeur ÉPINGLE un produit de sa boutique ;
 * il s'affiche à tous les spectateurs comme une CARD PRODUIT portant DÉJÀ son
 * bouton Acheter (le paiement voyage avec la card — non reconstruit ici).
 *
 *   POST { productId, shopId } → épingle le produit :
 *        - SEUL le diffuseur (room === me.id) et PROPRIÉTAIRE de la boutique peut épingler.
 *        - le `.card` est relu SERVEUR (source de vérité prix/vendeur), jamais fourni
 *          par le client → pas de falsification de prix.
 *        - stocké comme « produit épinglé courant » (pour les arrivées tardives) PUIS
 *          diffusé en temps réel via `live_product` sur le canal bus `live:{room}`.
 *   GET → { product } : le produit actuellement épinglé (remplit l'overlay d'un
 *        spectateur qui arrive en cours de route), ou null.
 *
 * Doctrine [[talk2me-pii-air-gap]] : la payload ne transporte que la card + des ids
 * boutique, aucun talk2me_id / téléphone / email.
 */
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { getSimpleShop, listItems, resolveLiveHost } from '@/lib/simple-shop';
import { setPinnedProduct, getPinnedProduct, isLive, type LivePinnedProduct } from '@/lib/live/session';
import { parseCard } from '@/lib/cards/supercard';
import { publish } from '@/lib/realtime-bus';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, ctx: { params: Promise<{ room: string }> }) {
  const me = getCurrentUserFromRequest(request);
  if (!me) return new Response('unauthorized', { status: 401 });
  const { room } = await ctx.params;
  const host = resolveLiveHost(room); // clé annonce → owner
  return Response.json({ product: getPinnedProduct(host), live: isLive(host) });
}

export async function POST(request: NextRequest, ctx: { params: Promise<{ room: string }> }) {
  const me = getCurrentUserFromRequest(request);
  if (!me) return new Response('unauthorized', { status: 401 });
  const { room } = await ctx.params;
  const host = resolveLiveHost(room); // clé annonce → owner

  // Seul le diffuseur épingle DANS SON PROPRE live.
  if (host !== me.id) return new Response('forbidden', { status: 403 });

  let body: { productId?: string; shopId?: string };
  try {
    body = await request.json();
  } catch {
    return new Response('bad_request', { status: 400 });
  }
  const productId = (body.productId || '').trim();
  const shopId = (body.shopId || '').trim();
  if (!productId || !shopId) return new Response('missing_ids', { status: 400 });

  // Ownership : la boutique doit appartenir au diffuseur.
  const shop = getSimpleShop(shopId);
  if (!shop || shop.owner_id !== me.id) return new Response('not_owner', { status: 403 });

  // La card = source de vérité SERVEUR (dotcard de l'article), jamais le client.
  const item = listItems(shopId).find((x) => x.id === productId);
  if (!item || !item.dotcard) return new Response('product_not_found', { status: 404 });
  const parsed = parseCard(item.dotcard);
  if (!parsed.ok || !parsed.card) return new Response('bad_card', { status: 422 });

  const payload: LivePinnedProduct = {
    card: parsed.card,
    shopId: shop.id,
    shopKey: shop.public_key || null,
    ts: Date.now(),
  };
  setPinnedProduct(host, payload);
  // Diffusion temps réel → diffuseur + tous les spectateurs abonnés à `live:{room}`.
  publish(`live:${room}`, { kind: 'live_product', data: payload });
  return Response.json({ ok: true });
}
