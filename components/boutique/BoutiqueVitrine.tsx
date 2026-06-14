'use client';

/* eslint-disable @next/next/no-img-element */
import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import ProductDetailSheet, { type SheetProduct } from './ProductDetailSheet';
import BoutiqueCart from './BoutiqueCart';
import { useCart } from '@/lib/boutique-cart-store';

interface ProductItem {
  id: string;
  media_url: string | null;
  caption: string | null;
  product: {
    title?: string;
    price_label?: string;
    image_url?: string;
    sizes?: string | null;
    wholesale?: boolean;
    source?: string;
    source_url?: string;
    cj_pid?: string | null;
  } | null;
  boosted?: boolean;
}

interface CategoryGroup {
  category: string;
  products: ProductItem[];
}

interface BoutiqueData {
  name: string;
  description: string | null;
  cover_url: string | null;
  cover_position?: string | null;
}

interface BoutiqueVitrineProps {
  boutique: BoutiqueData;
  categories: CategoryGroup[];
  shopId?: string;
}

export default function BoutiqueVitrine({ boutique, categories, shopId }: BoutiqueVitrineProps) {
  const [open, setOpen] = useState<SheetProduct | null>(null);
  const addToCart = useCart((s) => s.add);
  return (
    <div className="w-full">
      {/* Header full-bleed paysage type couverture Facebook */}
      <div className="relative w-full h-[160px] sm:h-[240px] md:h-[480px] lg:h-[560px] overflow-hidden bg-[#15151c]">
        {boutique.cover_url ? (
          <img
            src={boutique.cover_url}
            alt={boutique.name}
            className="w-full h-full object-cover object-center"
            style={{ objectPosition: boutique.cover_position || 'center center' }}
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-red-900/60 to-red-700/30" />
        )}
        <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 to-transparent p-4 sm:px-6">
          <h1 className="text-[22px] sm:text-[26px] font-bold text-white">{boutique.name}</h1>
          {boutique.description && (
            <p className="text-[13px] sm:text-[14px] text-white/80 line-clamp-2 mt-1">
              {boutique.description}
            </p>
          )}
        </div>
      </div>

      {/* Contenu centré */}
      <div className="max-w-5xl mx-auto">
        {categories.length === 0 ? (
          <div className="flex items-center justify-center h-40 text-white/60 text-sm">
            Cette boutique n&apos;a pas encore de produits.
          </div>
        ) : (
          categories.map((cat) => (
            <div key={cat.category} className="mb-2">
              <h2 className="text-[15px] sm:text-[17px] font-semibold text-white px-4 mt-4 mb-2">
                {cat.category}
              </h2>
              <div
                className="flex gap-3 px-4 overflow-x-auto snap-x"
                style={{ scrollbarWidth: 'none' }}
              >
                {cat.products.map((item) => {
                  const imageUrl = item.product?.image_url || item.media_url;
                  const title = item.product?.title || item.caption || 'Produit';
                  const price = item.product?.price_label || '';
                  const sizes = item.product?.sizes || '';
                  const wholesale = item.product?.wholesale === true;

                  return (
                    <div
                      key={item.id}
                      role="button"
                      tabIndex={0}
                      onClick={() =>
                        setOpen({
                          cardId: item.id,
                          title,
                          image: imageUrl || null,
                          price_label: price,
                          sizes,
                        })
                      }
                      className="w-[150px] sm:w-[170px] shrink-0 snap-start rounded-2xl border border-white/10 bg-white/[0.03] overflow-hidden flex flex-col text-left active:scale-[0.98] transition-transform cursor-pointer"
                    >
                      <div className="relative w-full aspect-[3/4]">
                        {imageUrl ? (
                          <img
                            src={imageUrl}
                            alt={title}
                            className="w-full h-full object-contain"
                          />
                        ) : (
                          <div className="w-full h-full bg-white/5" />
                        )}
                        {item.boosted && (
                          <span className="absolute top-2 left-2 bg-red-600 text-white text-[10px] px-2 py-0.5 rounded-full font-medium">
                            Sponsorisé
                          </span>
                        )}
                        {wholesale && (
                          <span className="absolute top-2 right-2 bg-amber-500 text-black text-[10px] px-2 py-0.5 rounded-full font-bold">
                            GROS
                          </span>
                        )}
                        {/* + panier (acheter) */}
                        {shopId && (
                          <button
                            type="button"
                            aria-label="Ajouter au panier"
                            onClick={(e) => { e.stopPropagation(); addToCart(shopId, boutique.name, { productId: item.id, title, priceLabel: price, imageUrl: imageUrl || null }); }}
                            className="absolute bottom-2 right-2 w-9 h-9 rounded-full bg-red-600 text-white grid place-items-center shadow-lg active:scale-90"
                          >
                            <Plus className="w-5 h-5" strokeWidth={2.6} />
                          </button>
                        )}
                      </div>
                      <div className="p-2 flex flex-col gap-1">
                        <p className="text-[12px] text-white line-clamp-2 leading-tight">
                          {title}
                        </p>
                        {price && (
                          <p className="text-[13px] font-bold text-white">
                            {price}
                          </p>
                        )}
                        {sizes && (
                          <p className="text-[11px] text-white/60 leading-tight">
                            Tailles : <span className="text-white/85 font-medium">{sizes}</span>
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>

      {shopId && <BoutiqueCart shopId={shopId} />}
      {open && <ProductDetailSheet product={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
