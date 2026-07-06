'use client';

/**
 * Talk2Me — LIVE SHOPPING · sélecteur « 🛍️ Mes produits » (Pascal 2026-07-05).
 *
 * Pour le DIFFUSEUR pendant son live : un bouton discret ouvre une rangée de SES
 * produits (GET /api/live/products) ; taper un produit l'ÉPINGLE (POST
 * /api/live/{liveId}/product) → il apparaît en overlay chez tous les spectateurs
 * comme une card produit qui porte son bouton Acheter.
 *
 * Ne gêne ni la caméra ni les commentaires : bouton flottant + feuille en bas.
 */

import { useCallback, useEffect, useState } from 'react';
import { formatMoney } from '@/lib/money';

interface LiveProduct {
  id: string; shopId: string; shopName: string; kind: string | null;
  label: string; price_cents: number; image_url: string;
}

export default function LiveProductPicker({ liveId }: { liveId: string }) {
  const [open, setOpen] = useState(false);
  const [products, setProducts] = useState<LiveProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [pinning, setPinning] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/live/products', { cache: 'no-store' });
      const j = await r.json();
      if (j?.ok && Array.isArray(j.products)) setProducts(j.products as LiveProduct[]);
    } catch { /* ignore */ } finally { setLoading(false); setLoaded(true); }
  }, []);

  useEffect(() => { if (open && !loaded) void load(); }, [open, loaded, load]);

  const pin = useCallback(async (p: LiveProduct) => {
    if (pinning) return;
    setPinning(p.id);
    try {
      await fetch(`/api/live/${liveId}/product`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: p.id, shopId: p.shopId }),
      });
      setOpen(false); // épinglé : l'overlay apparaît (même canal SSE)
    } catch { /* ignore */ } finally { setPinning(null); }
  }, [liveId, pinning]);

  return (
    <>
      {/* Bouton flottant discret (au-dessus des commentaires, côté droit). */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Épingler un produit"
        className="absolute right-3 z-50 pointer-events-auto flex items-center gap-1.5 rounded-full bg-black/55 backdrop-blur border border-white/20 pl-2.5 pr-3 py-2 text-white text-[12px] font-semibold active:scale-95"
        style={{ bottom: 'calc(env(safe-area-inset-bottom,0px) + 150px)' }}
      >
        🛍️ Mes produits
      </button>

      {/* Feuille de sélection — rangée horizontale de produits. */}
      {open && (
        <div className="absolute inset-x-0 bottom-0 z-[55] pointer-events-auto">
          <div className="bg-black/85 backdrop-blur border-t border-white/10 px-3 pt-2.5 pb-4" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom,0px) + 16px)' }}>
            <div className="flex items-center justify-between mb-2">
              <div className="text-white text-[13px] font-bold">Épingler un produit</div>
              <button type="button" onClick={() => setOpen(false)} className="text-white/70 text-[18px] leading-none w-7 h-7 flex items-center justify-center">✕</button>
            </div>
            {loading ? (
              <div className="text-white/60 text-[12px] py-6 text-center">Chargement…</div>
            ) : products.length === 0 ? (
              <div className="text-white/60 text-[12px] py-6 text-center">Aucun produit dans tes boutiques. Ajoute-en pour les vendre en direct.</div>
            ) : (
              <div className="flex gap-2.5 overflow-x-auto no-scrollbar pb-1">
                {products.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => void pin(p)}
                    disabled={pinning === p.id}
                    className="shrink-0 w-28 text-left rounded-xl overflow-hidden bg-white/[0.06] border border-white/10 active:scale-95 transition disabled:opacity-50"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.image_url} alt={p.label} className="w-full h-28 object-cover bg-black/40" />
                    <div className="p-1.5">
                      <div className="text-[11px] text-white/90 line-clamp-1">{p.label}</div>
                      <div className="text-[11px] font-bold text-emerald-300">{formatMoney(p.price_cents, 'MGA')}</div>
                      <div className="text-[10px] text-white/50">{pinning === p.id ? 'Épinglage…' : 'Épingler'}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
