'use client';

/* eslint-disable @next/next/no-img-element */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ShoppingBag, X, Plus, Minus, Loader2, Trash2 } from 'lucide-react';
import { useCart } from '@/lib/boutique-cart-store';

/** Extrait un nombre d'un libellé prix (« 45 € », « 12,50€ »…). */
function parsePrice(label: string): number {
  const m = (label || '').replace(',', '.').match(/[\d.]+/);
  return m ? parseFloat(m[0]) : 0;
}

export default function BoutiqueCart({ shopId }: { shopId: string }) {
  const router = useRouter();
  const { items, shopName, setQty, remove, clear, count } = useCart();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const n = count();

  const total = items.reduce((s, i) => s + parsePrice(i.priceLabel) * i.qty, 0);
  const hasPrices = items.some((i) => parsePrice(i.priceLabel) > 0);

  const commander = async () => {
    if (busy || !items.length) return;
    setBusy(true);
    try {
      const r = await fetch('/api/boutique/order', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ shopId }) });
      const d = await r.json();
      if (!r.ok || !d.conversationId) { setBusy(false); return; }
      // résumé de commande envoyé au vendeur dans le chat
      const lines = items.map((i) => `• ${i.qty}× ${i.title}${i.priceLabel ? ` (${i.priceLabel})` : ''}`).join('\n');
      const text = `Commande — ${shopName || 'ta boutique'}\n${lines}${hasPrices ? `\n\nTotal estimé : ${total.toFixed(2)} €` : ''}\n\nBonjour, je voudrais commander ces articles. C'est dispo ?`;
      await fetch(`/api/conversations/${d.conversationId}/messages`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) }).catch(() => {});
      clear();
      router.push(`/c/${d.conversationId}`);
    } finally { setBusy(false); }
  };

  if (n === 0) return null;

  return (
    <>
      {/* bouton flottant panier */}
      <button onClick={() => setOpen(true)}
        className="fixed bottom-20 right-4 z-50 w-14 h-14 rounded-full bg-white text-black shadow-lg shadow-black/40 grid place-items-center active:scale-95">
        <ShoppingBag className="w-6 h-6" />
        <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 rounded-full bg-black text-white text-[12px] font-bold grid place-items-center border border-white/30">{n}</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm flex items-end" onClick={() => setOpen(false)}>
          <div className="w-full max-h-[85dvh] overflow-y-auto bg-[#101015] rounded-t-3xl border-t border-white/10 p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]"
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-white font-semibold text-[16px] inline-flex items-center gap-2"><ShoppingBag className="w-5 h-5 text-white/80" /> Mon panier {shopName ? `· ${shopName}` : ''}</h2>
              <button onClick={() => setOpen(false)} className="w-8 h-8 rounded-full bg-white/10 grid place-items-center text-white/80"><X className="w-4 h-4" /></button>
            </div>

            <div className="space-y-2">
              {items.map((i) => (
                <div key={i.productId} className="flex items-center gap-3 bg-white/[0.05] border border-white/10 rounded-xl p-2">
                  <div className="w-14 h-14 rounded-lg bg-black/30 overflow-hidden shrink-0">
                    {i.imageUrl && <img src={i.imageUrl} alt="" className="w-full h-full object-cover" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-white text-[13px] font-medium truncate">{i.title}</div>
                    {i.priceLabel && <div className="text-white/70 text-[12px]">{i.priceLabel}</div>}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => setQty(i.productId, i.qty - 1)} className="w-7 h-7 rounded-full bg-white/10 grid place-items-center text-white/80"><Minus className="w-3.5 h-3.5" /></button>
                    <span className="text-white text-[13px] w-5 text-center">{i.qty}</span>
                    <button onClick={() => setQty(i.productId, i.qty + 1)} className="w-7 h-7 rounded-full bg-white/10 grid place-items-center text-white/80"><Plus className="w-3.5 h-3.5" /></button>
                    <button onClick={() => remove(i.productId)} className="w-7 h-7 rounded-full bg-white/5 grid place-items-center text-white/40 ml-1"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </div>
              ))}
            </div>

            {hasPrices && (
              <div className="flex items-center justify-between mt-3 text-white">
                <span className="text-white/60 text-[13px]">Total estimé</span>
                <span className="font-bold text-[16px]">{total.toFixed(2)} €</span>
              </div>
            )}

            <button onClick={commander} disabled={busy}
              className="w-full mt-3 py-3.5 rounded-xl bg-white text-black text-[15px] font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-40 active:scale-[0.99]">
              {busy ? <><Loader2 className="w-5 h-5 animate-spin" /> Envoi de la commande…</> : <><ShoppingBag className="w-5 h-5" /> Commander ({n})</>}
            </button>
            <p className="text-white/35 text-[11px] text-center mt-1.5">Ta commande part au vendeur dans le chat. Paiement à convenir avec lui.</p>
          </div>
        </div>
      )}
    </>
  );
}
