'use client';

/**
 * Talk2Me #427 — ShopCard : dans le sous-onglet Shop, on montre UNIQUEMENT la
 * carte PRODUIT attachée (pas toute la compo vidéo/disque). Pascal 2026-06-07.
 *
 * - Tap "Voir" → page fournisseur (sans t2m_ref : depuis le Shop personne n'est
 *   crédité, doctrine [[project_talk2me_shop_affiliation]]).
 * - "+ Créer ma card" → re-attache le produit dans MON post (gabarit).
 * - Badge "Sponsorisé" si l'offre est boostée.
 */

import { ShoppingBag, ExternalLink, ArrowRight } from 'lucide-react';
import { useCardCreationStore } from '@/lib/card-creation-store';
import type { ProductCardData } from '@/lib/chat-types';

interface ShopItem {
  attached_product_json?: string | null;
  boosted_until?: number | null;
}

export default function ShopCard({ item }: { item: ShopItem }) {
  const openWithProduct = useCardCreationStore((s) => s.openWithProduct);

  let product: ProductCardData | null = null;
  try {
    if (item.attached_product_json) product = JSON.parse(item.attached_product_json) as ProductCardData;
  } catch {
    product = null;
  }
  if (!product || !product.title) {
    return (
      <div className="h-full flex items-center justify-center text-white/40 text-sm">
        Offre indisponible
      </div>
    );
  }
  const p = product;
  const boosted = typeof item.boosted_until === 'number' && item.boosted_until > Date.now();

  return (
    <div className="h-full w-full flex flex-col items-center justify-center p-5">
      <div className="w-full max-w-[340px] rounded-3xl overflow-hidden bg-[#15151c] border border-white/10 shadow-2xl">
        <div className="relative w-full aspect-square bg-white/5">
          {p.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.image_url} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <ShoppingBag className="w-12 h-12 text-violet-300/60" />
            </div>
          )}
          {boosted && (
            <span className="absolute top-2 left-2 px-2 py-0.5 rounded-full text-[10px] font-semibold text-white bg-violet-500/80 backdrop-blur">
              Sponsorisé
            </span>
          )}
          {p.price_label && (
            <span className="absolute bottom-2 left-2 px-2.5 py-1 rounded-full text-[15px] font-bold text-white bg-black/60 backdrop-blur">
              {p.price_label}
            </span>
          )}
        </div>
        <div className="p-4">
          <div className="text-[15px] font-semibold text-white/95 leading-snug line-clamp-2">
            {p.title}
          </div>
          {/* Pas d'auteur : une fois attachée, la carte produit n'a plus
              d'identité de posteur (Pascal 2026-06-07). */}
          <div className="text-[12px] text-white/50 mt-1">{p.source}</div>

          <a
            href={p.source_url}
            target="_blank"
            rel="noopener noreferrer sponsored"
            className="mt-4 w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-red-500/15 border border-red-400/25 text-red-100 text-[13px] font-medium active:scale-[0.98] transition"
          >
            <ExternalLink className="w-4 h-4" /> Voir sur {p.source}
          </a>

          {/* CTA : créer sa propre postcard pour vendre ce produit. Le produit
              (URL incluse) est servi dans le composer (gabarit). */}
          <button
            type="button"
            onClick={() => openWithProduct(p)}
            className="mt-2 w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-violet-500/15 border border-violet-400/30 text-violet-100 text-[13px] font-semibold active:scale-[0.98] transition"
          >
            Créer une postcard et vendre ce produit <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
