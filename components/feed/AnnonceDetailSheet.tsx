'use client';

/* eslint-disable @next/next/no-img-element */
/**
 * Talk2Me — Détail d'une annonce déposée (Pascal 2026-06-11). On rentre DANS
 * l'annonce, et de là on peut « Voir la boutique » (si elle est rattachée) et
 * « Contacter le vendeur ». L'annonce est la porte d'entrée, pas l'inverse.
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { X, MessageCircle, Store, Loader2, MapPin, ShoppingBag, Lock, Pencil } from 'lucide-react';
import { buyError } from '@/lib/client/buy-error';
import { formatMoney } from '@/lib/money';

export interface AnnonceDetail {
  id: string;
  title: string;
  media_url: string | null;
  price_label: string | null;
  category: string;
  description: string | null;
  city: string | null;
  seller: string | null;
  shop_key: string | null;
  shop_name: string | null;
}

export default function AnnonceDetailSheet({
  annonce, onClose, onViewShop, isMine, onEdit,
}: { annonce: AnnonceDetail; onClose: () => void; onViewShop: (shopKey: string) => void; isMine?: boolean; onEdit?: () => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const contact = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await fetch('/api/annonces/contact', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ annonceId: annonce.id }),
      });
      const d = await r.json();
      if (r.ok && d.conversationId) { onClose(); router.push(`/c/${d.conversationId}`); }
      else setBusy(false);
    } catch { setBusy(false); }
  };

  // ACHAT PROTÉGÉ : argent bloqué en escrow jusqu'à réception, puis libéré au vendeur.
  const acheter = async () => {
    if (busy) return;
    setBusy(true);
    try {
      // 1) Devis : on montre le décompte complet AVANT de débiter.
      const q = await fetch('/api/commerce/quote', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'annonce', annonce_id: annonce.id }) }).then((x) => x.json()).catch(() => null);
      if (q?.ok && q.quote) {
        const z = q.quote;
        const recap = `Article : ${formatMoney(z.article)}\nCommission Talk2Me (3%) : ${formatMoney(z.commission)}\nFrais de paiement : ${formatMoney(z.papi_fee)}${z.delivery ? `\nLivraison : ${formatMoney(z.delivery)}` : ''}\n──────────────\nTotal à payer : ${formatMoney(z.total)}\n\nConfirmer l'achat ?`;
        if (!window.confirm(recap)) { setBusy(false); return; }
      }
      const tryBuy = (extra?: { msisdn: string }) =>
        fetch('/api/commerce/buy', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'annonce', annonce_id: annonce.id, ...extra }) }).then((x) => x.json());
      let d = await tryBuy();
      if (!d.ok && (d.error === 'msisdn_required' || d.error === 'insufficient_funds')) {
        const msisdn = window.prompt('Ton numéro MVola (034 / 038…) pour payer :', '') || '';
        if (!msisdn) { setBusy(false); return; }
        d = await tryBuy({ msisdn });
      }
      if (!d.ok) { alert(buyError(d.error)); setBusy(false); return; }
      if (d.mode === 'paid') { onClose(); alert('✅ Achat protégé. L’argent est bloqué jusqu’à ce que tu confirmes la réception (Wallet) — puis il part au vendeur.'); return; }
      if (d.checkout_url) { window.location.assign(d.checkout_url); return; }
      onClose();
      alert('📲 Demande de paiement envoyée sur ton téléphone. Confirme avec ton code MVola.');
    } catch { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-[75] bg-black/70 backdrop-blur-sm flex items-end" onClick={onClose}>
      <div className="w-full max-h-[92dvh] overflow-y-auto bg-[#101015] rounded-t-3xl border-t border-white/10" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-3 bg-[#101015]/95 backdrop-blur border-b border-white/8">
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-red-500/15 text-red-200">{annonce.category}</span>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/10 grid place-items-center text-white/80"><X className="w-4 h-4" /></button>
        </div>

        <div className="pb-[calc(env(safe-area-inset-bottom)+1rem)]">
          {annonce.media_url && (
            <img src={annonce.media_url} alt={annonce.title} className="w-full max-h-[55dvh] object-contain bg-black" />
          )}
          <div className="p-4 space-y-2">
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-white font-semibold text-[18px] leading-tight">{annonce.title}</h2>
              {annonce.price_label && <span className="text-red-300 font-bold text-[17px] shrink-0">{annonce.price_label}</span>}
            </div>
            <div className="flex items-center gap-3 text-[12px] text-white/50">
              {annonce.city && <span className="inline-flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{annonce.city}</span>}
              {annonce.seller && <span>par {annonce.seller}</span>}
            </div>
            {annonce.description && <p className="text-[14px] text-white/80 leading-relaxed whitespace-pre-wrap pt-1">{annonce.description}</p>}
          </div>

          <div className="px-4 pt-2 space-y-2">
            {/* ACHETER : visible partout (Pascal). Sur SA propre annonce, le serveur
                refusera l'auto-achat ; mais le bouton reste affiché. */}
            {annonce.price_label && (
              <>
                <button onClick={acheter} disabled={busy}
                  className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-emerald-500 text-black font-semibold text-[15px] disabled:opacity-50 active:scale-[0.99]">
                  {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <ShoppingBag className="w-5 h-5" />}
                  Acheter {annonce.price_label}
                </button>
                <p className="text-white/45 text-[11px] text-center inline-flex items-center justify-center gap-1 w-full"><Lock className="w-3 h-3" /> Paiement protégé : bloqué jusqu’à réception, puis libéré au vendeur.</p>
              </>
            )}
            {isMine ? (
              /* Ma propre annonce → Modifier (pas de « Contacter », absurde sur la sienne). */
              onEdit && (
                <button onClick={() => { onEdit(); onClose(); }}
                  className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-white text-black font-semibold text-[15px] active:scale-[0.99]">
                  <Pencil className="w-5 h-5" /> Modifier mon annonce
                </button>
              )
            ) : (
              <button onClick={contact} disabled={busy}
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-red-600 text-white font-semibold text-[15px] disabled:opacity-50 active:scale-[0.99]">
                {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <MessageCircle className="w-5 h-5" />}
                {busy ? 'Ouverture du chat…' : 'Contacter le vendeur'}
              </button>
            )}
            {annonce.shop_key && (
              <button onClick={() => { onClose(); onViewShop(annonce.shop_key!); }}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-white/10 text-white font-medium text-[14px] active:scale-[0.99]">
                <Store className="w-4.5 h-4.5 text-red-300" /> Voir la boutique{annonce.shop_name ? ` · ${annonce.shop_name}` : ''}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
