'use client';
/**
 * cart-store — panier PERSISTANT (localStorage), par boutique. Survit à la fermeture/refresh.
 * Le panier (avant paiement) est local à l'appareil ; une fois payé → commande suivie côté serveur
 * (escrow + shipment). Le profil lit `listCarts()` pour « Mon panier », la boutique lit/écrit le sien.
 * Un seul contrat → même comportement web ET (miroir) natif.
 */
export type CartMap = Record<string, number>; // item_id → quantité

export interface CartMeta {
  shopId: string;
  shopName: string;
  shopKey?: string | null;
  kind?: string;
  updatedAt: number;
  cart: CartMap;
  count: number;   // total d'articles
}

const KEY = 't2m:carts';

function readAll(): Record<string, CartMeta> {
  if (typeof window === 'undefined') return {};
  try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; }
}
function writeAll(all: Record<string, CartMeta>) {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(KEY, JSON.stringify(all)); window.dispatchEvent(new Event('t2m:carts:changed')); } catch { /* quota */ }
}

/** Panier d'une boutique (vide si aucun). */
export function getCart(shopId: string): CartMap {
  return readAll()[shopId]?.cart || {};
}

/** Écrit le panier d'une boutique (supprimé si vide). `meta` = infos boutique pour l'afficher au profil. */
export function saveCart(shopId: string, cart: CartMap, meta: { shopName: string; shopKey?: string | null; kind?: string }) {
  const all = readAll();
  const clean: CartMap = {};
  let count = 0;
  for (const [k, v] of Object.entries(cart || {})) { const q = Math.max(0, Math.floor(v)); if (q > 0) { clean[k] = q; count += q; } }
  if (count === 0) { delete all[shopId]; }
  else { all[shopId] = { shopId, shopName: meta.shopName, shopKey: meta.shopKey ?? null, kind: meta.kind, updatedAt: Date.now(), cart: clean, count }; }
  writeAll(all);
}

/** Vide le panier d'une boutique (après paiement). */
export function clearCart(shopId: string) {
  const all = readAll(); if (all[shopId]) { delete all[shopId]; writeAll(all); }
}

/** Tous les paniers en cours (pour « Mon panier » au profil), les plus récents d'abord. */
export function listCarts(): CartMeta[] {
  return Object.values(readAll()).filter((c) => c.count > 0).sort((a, b) => b.updatedAt - a.updatedAt);
}

/** Nombre total d'articles dans TOUS les paniers (pour une pastille). */
export function totalCartCount(): number {
  return listCarts().reduce((s, c) => s + c.count, 0);
}
