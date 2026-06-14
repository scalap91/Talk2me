'use client';

/**
 * Talk2Me — LA boutique unique (type Shein) (#429, Pascal 2026-06-08).
 * Plus de vendeurs ni de multi-boutiques : un seul store, pleine page, produits
 * rangés par catégories. 4 articles par rangée. Tap → fiche complète.
 */

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import ProductDetailSheet, { type SheetProduct } from './ProductDetailSheet';

interface P { id: string; title: string; image: string | null; price_label: string | null }
interface Cat { category: string; products: P[] }

export default function ShopStore() {
  const [cats, setCats] = useState<Cat[] | null>(null);
  const [preview, setPreview] = useState<SheetProduct | null>(null);

  useEffect(() => {
    fetch('/api/shop/store', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => setCats(d.categories || []))
      .catch(() => setCats([]));
  }, []);

  if (cats === null) return <div className="py-20 text-center text-white/40"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div>;
  if (cats.length === 0) return <p className="py-20 text-center text-[13px] text-white/40">La boutique se remplit…</p>;

  return (
    <div className="pb-6">
      {cats.map((c) => (
        <section key={c.category} className="mb-5">
          <h2 className="px-3 mb-2 text-[15px] font-bold text-white">{c.category}</h2>
          {/* 4 articles par rangée */}
          <div className="grid grid-cols-4 gap-1.5 px-2">
            {c.products.map((p) => (
              <button key={p.id} onClick={() => setPreview({ cardId: p.id, title: p.title, image: p.image, price_label: p.price_label || '' })}
                className="rounded-xl overflow-hidden bg-white/[0.03] border border-white/8 active:scale-[0.97] transition-transform text-left">
                <div className="relative w-full aspect-square bg-white/[0.05]">
                  {p.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.image} alt={p.title} className="w-full h-full object-contain" />
                  ) : null}
                </div>
                <div className="px-1 pb-1.5 pt-1">
                  <p className="text-[9px] text-white/70 line-clamp-1 leading-tight">{p.title}</p>
                  {p.price_label && <p className="text-[10px] font-bold text-white">{p.price_label}</p>}
                </div>
              </button>
            ))}
          </div>
        </section>
      ))}
      {preview && <ProductDetailSheet product={preview} onClose={() => setPreview(null)} />}
    </div>
  );
}
