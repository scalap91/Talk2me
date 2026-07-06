'use client';

/* eslint-disable @next/next/no-img-element */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ShoppingBag, X, Plus, Minus, Loader2, Trash2 } from '@/lib/icons';
import { buyError } from '@/lib/client/buy-error';
import { getPosition } from '@/lib/client/geo';
import { useCart } from '@/lib/boutique-cart-store';
import { formatMoney } from '@/lib/money';
import MobilePayAuthModal from '@/components/pay/MobilePayAuthModal';
import PaymentFrame from '@/components/pay/PaymentFrame';

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
  const [payUrl, setPayUrl] = useState<string | null>(null);     // page PaPi DANS l'app (iframe)
  const [payIntent, setPayIntent] = useState<string | null>(null);
  const [payAuthId, setPayAuthId] = useState<string | null>(null); // step-up validation mobile (desktop)
  const n = count();

  const total = items.reduce((s, i) => s + parsePrice(i.priceLabel) * i.qty, 0);
  const hasPrices = items.some((i) => parsePrice(i.priceLabel) > 0);

  // Suit une commande payée par MVola (push USSD) jusqu'à la création de l'escrow.
  const pollOrder = async (intentId: string) => {
    for (let i = 0; i < 20; i++) {
      await new Promise((res) => setTimeout(res, 4000));
      try {
        const d = await fetch(`/api/wallet/topup/status?intent=${encodeURIComponent(intentId)}`, { cache: 'no-store' }).then((x) => x.json());
        if (d.status === 'paid') { alert('✅ Paiement reçu — argent bloqué (escrow) jusqu’à ce que tu confirmes la réception, dans ton Wallet.'); return; }
        if (d.status === 'failed') { alert('❌ Paiement échoué ou refusé.'); return; }
      } catch { /* on continue */ }
    }
  };

  // ACHAT PROTÉGÉ : l'argent est bloqué en escrow jusqu'à réception, puis libéré au vendeur.
  const acheter = async (authId?: string) => {
    if (busy || !items.length) return;
    setBusy(true);
    try {
      const pos = await getPosition(); // position acheteur → calcul livraison par distance
      const payload = { type: 'boutique', shop_id: shopId, items: items.map((i) => ({ item_id: i.productId, qty: i.qty })), lat: pos?.lat, lng: pos?.lng, force_external: true, pay_auth_id: authId } as Record<string, unknown>;
      // Devis + confirmation (sauté si on rejoue après validation mobile).
      if (!authId) {
        const qr = await fetch('/api/commerce/quote', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }).then((x) => x.json()).catch(() => null);
        if (qr?.ok && qr.quote) {
          const z = qr.quote;
          const recap = `Articles : ${formatMoney(z.article)}\nCommission Talk2Me (3%) : ${formatMoney(z.commission)}\nFrais de paiement : ${formatMoney(z.papi_fee)}${z.delivery ? `\nLivraison : ${formatMoney(z.delivery)}` : ''}\n──────────────\nTotal à payer : ${formatMoney(z.total)}\n\nConfirmer l'achat ?`;
          if (!window.confirm(recap)) { setBusy(false); return; }
        }
      }
      const tryBuy = (extra?: { msisdn: string }) =>
        fetch('/api/commerce/buy', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payload, ...extra }) }).then((x) => x.json());

      let d = await tryBuy();
      // STEP-UP : achat depuis un ordinateur → validation mobile avant la page de paiement.
      if (d.needs_mobile_auth) { setPayAuthId(d.auth_id); setBusy(false); return; }
      // Solde insuffisant → paiement mobile money : on demande le numéro et on réessaie.
      if (!d.ok && (d.error === 'msisdn_required' || d.error === 'insufficient_funds')) {
        const msisdn = window.prompt('Ton numéro MVola (034 / 038…) pour payer :', '') || '';
        if (!msisdn) { setBusy(false); return; }
        d = await tryBuy({ msisdn });
      }
      if (!d.ok) { alert(buyError(d.error)); return; }

      if (d.mode === 'paid') {
        clear(); setOpen(false);
        alert('✅ Achat protégé. L’argent est bloqué jusqu’à ce que tu confirmes la réception (dans ton Wallet) — puis il part au vendeur.');
        return;
      }
      // PaPi DANS l'app (modal iframe, jamais de navigateur externe) — doctrine paiement.
      if (d.checkout_url) { setPayIntent(d.intent_id || null); setPayUrl(d.checkout_url); setBusy(false); return; }
      clear(); setOpen(false);
      alert('📲 Demande de paiement envoyée sur ton téléphone. Confirme avec ton code MVola — l’achat se valide tout seul.');
      if (d.intent_id) pollOrder(d.intent_id);
    } finally { setBusy(false); }
  };

  // Fermeture du paiement PaPi → on vérifie le règlement (callback) puis on confirme.
  const closePay = async () => {
    const intent = payIntent;
    setPayUrl(null); setPayIntent(null);
    if (!intent) return;
    try {
      const s = await fetch(`/api/wallet/topup/status?intent=${encodeURIComponent(intent)}`, { cache: 'no-store' }).then((r) => r.json());
      if (s?.status === 'paid') { clear(); setOpen(false); alert('✅ Paiement confirmé. Achat protégé — l’argent part au vendeur à la réception.'); }
    } catch { /* */ }
  };

  // Secondaire : juste discuter avec le vendeur (ancien flux, sans paiement).
  const contacter = async () => {
    if (busy || !items.length) return;
    setBusy(true);
    try {
      const r = await fetch('/api/boutique/order', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ shopId }) });
      const d = await r.json();
      if (!r.ok || !d.conversationId) { setBusy(false); return; }
      const lines = items.map((i) => `• ${i.qty}× ${i.title}${i.priceLabel ? ` (${i.priceLabel})` : ''}`).join('\n');
      const text = `Commande — ${shopName || 'ta boutique'}\n${lines}\n\nBonjour, je voudrais ces articles. C'est dispo ?`;
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
                <span className="font-bold text-[16px]">{formatMoney(total)}</span>
              </div>
            )}

            <button onClick={() => acheter()} disabled={busy}
              className="w-full mt-3 py-3.5 rounded-xl bg-emerald-500 text-black text-[15px] font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-40 active:scale-[0.99]">
              {busy ? <><Loader2 className="w-5 h-5 animate-spin" /> …</> : <><ShoppingBag className="w-5 h-5" /> Acheter ({n})</>}
            </button>
            <p className="text-white/45 text-[11px] text-center mt-1.5">🔒 Paiement protégé : l’argent est bloqué jusqu’à ce que tu confirmes la réception, puis libéré au vendeur.</p>
            <button onClick={contacter} disabled={busy}
              className="w-full mt-2 py-2 rounded-xl border border-white/12 text-white/60 text-[13px] disabled:opacity-40 active:scale-[0.99]">
              ou discuter avec le vendeur
            </button>
          </div>
        </div>
      )}

      {/* Step-up : validation mobile avant la page de paiement (achat depuis un PC). */}
      {payAuthId && <MobilePayAuthModal authId={payAuthId} onApproved={(id) => { setPayAuthId(null); acheter(id); }} onClose={() => setPayAuthId(null)} />}

      {/* Paiement PaPi DANS l'app — cadre brandé Talk2Me. */}
      {payUrl && <PaymentFrame url={payUrl} onClose={closePay} />}
    </>
  );
}
