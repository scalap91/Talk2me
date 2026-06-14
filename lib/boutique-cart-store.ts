'use client';

/**
 * Panier boutique (Pascal 2026-06-11). Panier d'UNE boutique à la fois (si on
 * ajoute un produit d'une autre boutique, le panier se réinitialise). Persisté
 * en localStorage. Sert à acheter chez un petit vendeur → « Commander » envoie
 * la commande au vendeur dans le chat.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface CartItem {
  productId: string;
  title: string;
  priceLabel: string;
  imageUrl: string | null;
  qty: number;
}

interface CartState {
  shopId: string | null;
  shopName: string | null;
  items: CartItem[];
  add: (shopId: string, shopName: string, item: Omit<CartItem, 'qty'>) => void;
  setQty: (productId: string, qty: number) => void;
  remove: (productId: string) => void;
  clear: () => void;
  count: () => number;
}

export const useCart = create<CartState>()(
  persist(
    (set, get) => ({
      shopId: null,
      shopName: null,
      items: [],
      add: (shopId, shopName, item) => set((s) => {
        // panier mono-boutique : changement de boutique → on repart à zéro
        const base = s.shopId && s.shopId !== shopId ? [] : s.items;
        const existing = base.find((i) => i.productId === item.productId);
        const items = existing
          ? base.map((i) => i.productId === item.productId ? { ...i, qty: i.qty + 1 } : i)
          : [...base, { ...item, qty: 1 }];
        return { shopId, shopName, items };
      }),
      setQty: (productId, qty) => set((s) => ({
        items: qty <= 0 ? s.items.filter((i) => i.productId !== productId) : s.items.map((i) => i.productId === productId ? { ...i, qty } : i),
      })),
      remove: (productId) => set((s) => ({ items: s.items.filter((i) => i.productId !== productId) })),
      clear: () => set({ items: [], shopId: null, shopName: null }),
      count: () => get().items.reduce((n, i) => n + i.qty, 0),
    }),
    { name: 't2m-boutique-cart' }
  )
);
