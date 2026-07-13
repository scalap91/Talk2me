'use client';

/* eslint-disable @next/next/no-img-element */
/**
 * Talk2Me — Shop · Panier (Pascal 2026-06-27, façon Temu). Vue du panier (store
 * boutique-cart) : articles, quantités, total. La finalisation protégée se fait
 * depuis la boutique (BoutiqueCart). Ici : voir / ajuster / vider.
 */
import { useRouter } from 'next/navigation';
import { ChevronLeft, Plus, Minus, Trash2, ShoppingCart } from '@/lib/icons';
import ShopNav from '@/components/shop/ShopNav';
import { useCart } from '@/lib/boutique-cart-store';
import { formatMoney } from '@/lib/money';

function parsePrice(label: string): number {
  const m = (label || '').replace(',', '.').match(/[\d.]+/);
  return m ? parseFloat(m[0]) : 0;
}

export default function ShopPanierPage() {
  const router = useRouter();
  const { items, shopName, setQty, remove, clear } = useCart();
  // Bouton « Découvre… » contextuel selon la dernière section du Shop.
  let section = 'boutiques';
  try { const s = typeof window !== 'undefined' ? sessionStorage.getItem('t2m_shop_section') : null; if (s === 'annonces' || s === 'plats' || s === 'boutiques') section = s; } catch { /* */ }
  const discoverLabel = section === 'annonces' ? 'Découvre les annonces' : section === 'plats' ? 'Découvre les restaurants' : 'Découvre la boutique';
  const total = items.reduce((s, i) => s + parsePrice(i.priceLabel) * i.qty, 0);
  const hasPrices = items.some((i) => parsePrice(i.priceLabel) > 0);

  return (
    <div className="fixed inset-0 z-[60] bg-[var(--t2m-paper)] text-[var(--t2m-ink)] flex flex-col">
      <ShopNav />
      <header className="shrink-0 flex items-center justify-between px-3 h-12 border-b border-[var(--t2m-line)]">
        <div className="flex items-center gap-2">
          <button onClick={() => router.push('/shop')} aria-label="Retour" className="w-9 h-9 rounded-full grid place-items-center text-[var(--t2m-ink-2)]"><ChevronLeft className="w-6 h-6" /></button>
          <h1 className="text-[16px] font-semibold">Mon panier{shopName ? ` · ${shopName}` : ''}</h1>
        </div>
        {items.length > 0 && <button onClick={clear} className="text-[12px] text-[var(--t2m-ink-3)] hover:text-red-500 px-2">Vider</button>}
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto p-4 pb-28 md:pb-6">
        <div className="max-w-2xl mx-auto">
          {items.length === 0 ? (
            <div className="py-20 text-center">
              <ShoppingCart className="w-9 h-9 text-[var(--t2m-ink-3)] mx-auto mb-3" strokeWidth={1.6} />
              <p className="text-[var(--t2m-ink-2)] text-[14px]">Ton panier est vide.</p>
              <button onClick={() => router.push('/shop')} className="mt-4 h-10 px-5 rounded-full bg-[var(--t2m-ink)] text-white text-[13.5px] font-semibold">{discoverLabel}</button>
            </div>
          ) : (
            <div className="space-y-2.5">
              {items.map((i) => (
                <div key={i.productId} className="flex items-center gap-3 bg-white border border-[var(--t2m-line)] shadow-[0_2px_10px_rgba(47,52,58,.05)] rounded-xl p-2.5">
                  <div className="w-16 h-16 rounded-lg bg-[var(--t2m-wash)] overflow-hidden shrink-0">{i.imageUrl && <img src={i.imageUrl} alt="" className="w-full h-full object-cover" />}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[var(--t2m-ink)] text-[14px] font-medium line-clamp-1">{i.title}</div>
                    {i.priceLabel && <div className="text-[var(--t2m-primary)] text-[13px] font-semibold mt-0.5">{i.priceLabel}</div>}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => setQty(i.productId, i.qty - 1)} className="w-8 h-8 rounded-full bg-[var(--t2m-wash)] grid place-items-center"><Minus className="w-4 h-4" /></button>
                    <span className="w-6 text-center text-[14px]">{i.qty}</span>
                    <button onClick={() => setQty(i.productId, i.qty + 1)} className="w-8 h-8 rounded-full bg-[var(--t2m-wash)] grid place-items-center"><Plus className="w-4 h-4" /></button>
                    <button onClick={() => remove(i.productId)} className="w-8 h-8 rounded-full grid place-items-center text-[var(--t2m-ink-3)] hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
              ))}
              {hasPrices && (
                <div className="flex items-center justify-between pt-3 text-[var(--t2m-ink)]">
                  <span className="text-[var(--t2m-ink-2)] text-[14px]">Total estimé</span>
                  <span className="font-bold text-[18px]">{formatMoney(total)}</span>
                </div>
              )}
              <p className="text-[var(--t2m-ink-3)] text-[12px] text-center pt-2">La finalisation protégée (paiement) se fait depuis la boutique du vendeur.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
