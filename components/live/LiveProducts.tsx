'use client';

/**
 * Talk2Me — LIVE SHOPPING · overlay produit épinglé (Pascal 2026-07-05).
 *
 * S'accroche à une vue Live (spectateur pièce 3D OU diffuseur InlineCamera).
 * Réutilise EXACTEMENT le temps réel des commentaires : un EventSource sur
 * `/api/live/{liveId}` (canal bus `live:{liveId}`). On écoute :
 *   - 'live_product' → { card, shopId, shopKey, ts }  (le vendeur épingle un produit)
 * + un snapshot GET `/api/live/{liveId}/product` pour les arrivées tardives.
 *
 * DOCTRINE « la card se paie elle-même » : on affiche la SuperCard produit via
 * <SuperCardView variant="product"> et un bouton Acheter dont le LIBELLÉ vient de
 * l'action de la card. Le paiement N'EST PAS reconstruit : il passe par le rail
 * UNIQUE existant `payForCard` (→ /api/commerce/buy, escrow/provider inchangés).
 *
 * Preuve sociale : à la création de la commande, un commentaire SYSTÈME
 * « 🛒 {pseudo} vient d'acheter {produit} » est diffusé dans le live (POST comment
 * avec flag system) — le texte est construit serveur (PII air-gap).
 */

import { useEffect, useRef, useState } from 'react';
import SuperCardView from '@/components/cards/SuperCardView';
import { payForCard } from '@/lib/client/pay-for-card';
import { buyError } from '@/lib/client/buy-error';
import MobilePayAuthModal from '@/components/pay/MobilePayAuthModal';
import PaymentFrame from '@/components/pay/PaymentFrame';
import type { SuperCard } from '@/lib/cards/supercard';

interface Pinned {
  card: SuperCard;
  shopId: string;
  shopKey: string | null;
  ts: number;
}

interface Props {
  /** id du diffuseur (= canal `live:{liveId}`). */
  liveId: string;
  /** false pour le diffuseur (il ne s'achète pas à lui-même) → aperçu seul. */
  canBuy?: boolean;
  /** Décalage bas (px) pour se poser AU-DESSUS du flux de commentaires. */
  insetBottom?: number;
}

export default function LiveProducts({ liveId, canBuy = true, insetBottom = 0 }: Props) {
  const [pinned, setPinned] = useState<Pinned | null>(null);
  const [closed, setClosed] = useState(false);        // spectateur a masqué la card
  const [buying, setBuying] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [payAuthId, setPayAuthId] = useState<string | null>(null);
  const [payUrl, setPayUrl] = useState<string | null>(null);
  const [payIntent, setPayIntent] = useState<string | null>(null);
  const announced = useRef(false); // 1 seule preuve sociale par achat

  // Snapshot (arrivée tardive) + flux temps réel (même SSE que les commentaires).
  useEffect(() => {
    if (!liveId) return;
    let dead = false;

    (async () => {
      try {
        const r = await fetch(`/api/live/${liveId}/product`, { cache: 'no-store' });
        if (r.ok && !dead) {
          const j = await r.json();
          if (j?.product?.card) { setPinned(j.product as Pinned); setClosed(false); }
        }
      } catch { /* ignore */ }
    })();

    const es = new EventSource(`/api/live/${liveId}`);
    es.addEventListener('live_product', (evt) => {
      try {
        const d = JSON.parse((evt as MessageEvent).data);
        if (!d?.card) return;
        announced.current = false; // nouveau produit → nouvelle preuve sociale possible
        setPinned(d as Pinned);
        setClosed(false);
        setMsg(null);
      } catch { /* ignore */ }
    });
    es.onerror = () => { /* reconnexion auto navigateur */ };

    return () => { dead = true; es.close(); };
  }, [liveId]);

  const card = pinned?.card;

  // Preuve sociale : « 🛒 X vient d'acheter … » (texte construit serveur, PII air-gap).
  const announceBought = async () => {
    if (!card || announced.current) return;
    announced.current = true;
    try {
      await fetch(`/api/live/${liveId}/comment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ system: true, product: card.title || 'un produit' }),
      });
    } catch { /* best-effort */ }
  };

  const runBuy = async (authId?: string) => {
    if (!card || !pinned || buying) return;
    setBuying(true); setMsg(null);
    try {
      const isEat = card.channel === 'eat';
      // RAIL UNIQUE existant — aucun paiement reconstruit.
      const d = await payForCard(card, isEat ? 'order' : 'buy', {
        shopId: pinned.shopId, shopKey: pinned.shopKey, payAuthId: authId,
      });
      // STEP-UP desktop : validation sur mobile avant la page de paiement.
      if (d.needsMobileAuth) { setPayAuthId(d.authId || null); return; }
      if (!d.ok && !d.checkoutUrl) { setMsg(buyError(d.error)); return; }
      // Commande / intent créés → preuve sociale (OK en sandbox, paiement non finalisé).
      void announceBought();
      if (d.mode === 'paid') { setMsg('✅ Achat protégé (escrow). Confirme la réception dans ton Wallet.'); return; }
      if (d.checkoutUrl) { setPayIntent(d.intentId || null); setPayUrl(d.checkoutUrl); return; }
      setMsg('📲 Demande de paiement envoyée sur ton téléphone.');
    } catch { setMsg('Erreur réseau.'); } finally { setBuying(false); }
  };

  const closePay = async () => {
    const intent = payIntent;
    setPayUrl(null); setPayIntent(null);
    if (!intent) return;
    try {
      const s = await fetch(`/api/wallet/topup/status?intent=${encodeURIComponent(intent)}`, { cache: 'no-store' }).then((r) => r.json());
      if (s?.status === 'paid') setMsg('✅ Paiement confirmé.');
    } catch { /* ignore */ }
  };

  if (!card || closed) return null;

  // Libellé du bouton = l'ACTION portée par la card (la card se paie elle-même).
  const act = (card.actions || []).find((a) => a.kind === 'buy' || a.kind === 'order' || a.kind === 'pay');
  const buyLabel = act?.label || (card.channel === 'eat' ? 'Commander' : 'Acheter');

  return (
    <>
      <div
        className="absolute left-3 z-50 pointer-events-none"
        style={{ bottom: insetBottom, width: 190, maxWidth: '62vw' }}
      >
        <div className="pointer-events-auto rounded-2xl overflow-hidden shadow-2xl ring-1 ring-white/15 bg-black/40 backdrop-blur">
          <div className="relative">
            {/* Masquer (spectateur) */}
            <button
              type="button"
              onClick={() => setClosed(true)}
              aria-label="Masquer le produit"
              className="absolute top-1 right-1 z-10 w-6 h-6 rounded-full bg-black/60 text-white/90 text-[13px] leading-none flex items-center justify-center active:scale-90"
            >
              ✕
            </button>
            {/* La CARD produit — moteur de rendu unique, variant product. */}
            <SuperCardView card={card} variant="product" reveal={['media', 'title', 'price']} theme="dark" />
          </div>

          {/* Bouton porté par la card → rail de paiement EXISTANT (payForCard). */}
          {canBuy ? (
            <button
              type="button"
              onClick={() => void runBuy()}
              disabled={buying}
              className="w-full py-2.5 text-[13px] font-bold text-white bg-emerald-500 active:scale-[0.98] disabled:opacity-50"
            >
              {buying ? 'Achat…' : `🛍️ ${buyLabel}`}
            </button>
          ) : (
            <div className="w-full py-2 text-[11px] font-semibold text-center text-white/60 bg-white/5">
              Produit épinglé
            </div>
          )}
          {msg && <div className="px-2.5 py-1.5 text-[11px] text-white/85 bg-black/50">{msg}</div>}
        </div>
      </div>

      {/* Step-up mobile + page de paiement DANS l'app — mêmes composants que la boutique. */}
      {payAuthId && (
        <MobilePayAuthModal
          authId={payAuthId}
          onApproved={(id) => { setPayAuthId(null); void runBuy(id); }}
          onClose={() => setPayAuthId(null)}
        />
      )}
      {payUrl && <PaymentFrame url={payUrl} onClose={() => void closePay()} />}
    </>
  );
}
