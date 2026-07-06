'use client';

/**
 * Talk2Me — Fiche boutique/resto plein écran (catalogue + commande). Partagé par
 * Annonces et Eat. Pour un resto (kind='eat') : panier + Commander → escrow.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, ChevronLeft, MessageCircle } from '@/lib/icons';
import { buyError } from '@/lib/client/buy-error';
import { formatMoney } from '@/lib/money';
import SuperCardView from '@/components/cards/SuperCardView';
import { parseCard, makeCard, type SuperCard } from '@/lib/cards/supercard';
import { payForCard } from '@/lib/client/pay-for-card';

// Card OS : la vitrine LIT le `.card` stocké de l'article ; fallback minimal pour les anciens.
function readBoutiqueCard(it: { id: string; image_url: string; label: string | null; price_cents: number; description?: string | null; dotcard?: string | null }): SuperCard {
  if (typeof it.dotcard === 'string' && it.dotcard) {
    const r = parseCard(it.dotcard);
    if (r.ok && r.card) return r.card;
  }
  return makeCard({
    id: it.id, types: ['product'], channel: 'boutique', title: it.label || 'Article',
    ...(it.image_url ? { images: [it.image_url] } : {}),
    ...(it.description ? { text: { body: it.description } } : {}),
    price: { amount: it.price_cents, currency: 'MGA' },
  });
}
import { getPosition } from '@/lib/client/geo';
import DeliveryTracking from './DeliveryTracking';
import MobilePayAuthModal from '@/components/pay/MobilePayAuthModal';
import PaymentFrame from '@/components/pay/PaymentFrame';

export default function BoutiqueSheet({ shopKey, onClose }: { shopKey: string; onClose: () => void }) {
  const router = useRouter();
  const [me, setMe] = useState<string | null>(null);
  const [contacting, setContacting] = useState(false);
  const [shop, setShop] = useState<{ name: string; description: string | null; kind?: string; owner_id?: string; address?: string | null; phone?: string | null; hours?: string | null; service_mode?: string | null; delivery_fee_cents?: number | null; min_order_cents?: number | null; prep_min?: number | null } | null>(null);
  const [items, setItems] = useState<{ id: string; image_url: string; label: string | null; price_cents: number; description?: string | null; section?: string | null; dotcard?: string | null }[]>([]);
  const [loading, setLoading] = useState(true);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [ordering, setOrdering] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [trackEscrow, setTrackEscrow] = useState<string | null>(null); // suivi livraison ouvert
  const [driveMode, setDriveMode] = useState(false); // l'user est chauffeur EN LIGNE → récupère lui-même
  const [payUrl, setPayUrl] = useState<string | null>(null);     // page PaPi DANS l'app (iframe)
  const [payIntent, setPayIntent] = useState<string | null>(null);
  const [payAuthId, setPayAuthId] = useState<string | null>(null); // step-up validation mobile (desktop)

  // L'appli RECONNAÎT le mode Drive (Pascal) : si tu es chauffeur en ligne, pas de
  // livraison — tu vas chercher ta commande toi-même (tu es déjà sur la route).
  useEffect(() => {
    fetch('/api/drive/driver', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => { if (d?.profile?.is_online) setDriveMode(true); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch(`/api/simple-shop/x?key=${encodeURIComponent(shopKey)}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => { if (d?.shop) { setShop(d.shop); setItems(d.items || []); } })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [shopKey]);

  useEffect(() => {
    fetch('/api/auth/me', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((d) => setMe(d?.user?.id || null)).catch(() => {});
  }, []);

  const eur = (c: number) => formatMoney(c);
  const isEat = shop?.kind === 'eat';
  const isMine = !!me && !!shop?.owner_id && me === shop.owner_id;

  const contactSeller = async () => {
    if (contacting) return;
    setContacting(true);
    try {
      const r = await fetch('/api/simple-shop/contact', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: shopKey }) });
      const d = await r.json();
      if (r.ok && d.conversationId) { onClose(); router.push(`/c/${d.conversationId}`); }
      else setContacting(false);
    } catch { setContacting(false); }
  };
  const addToCart = (id: string) => setCart((c) => ({ ...c, [id]: (c[id] || 0) + 1 }));
  const removeFromCart = (id: string) => setCart((c) => { const q = (c[id] || 0) - 1; const n = { ...c }; if (q <= 0) delete n[id]; else n[id] = q; return n; });
  const cartTotal = items.reduce((s, it) => s + (cart[it.id] || 0) * it.price_cents, 0);
  const cartCount = Object.values(cart).reduce((s, q) => s + q, 0);

  const order = async () => {
    if (!cartTotal || ordering || !shop?.owner_id) return;
    setOrdering(true); setMsg(null);
    const platform = Math.round(cartTotal * 0.10);
    const resto = cartTotal - platform;
    try {
      const r = await fetch('/api/wallet/escrow', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount_cents: cartTotal, order_ref: 'EAT-' + shopKey,
          breakdown: [
            { user_id: shop.owner_id, role: 'resto', amount_cents: resto },
            { user_id: 'platform', role: 'plateforme', amount_cents: platform },
          ],
        }),
      });
      const d = await r.json();
      if (r.ok && d?.ok) { setCart({}); const eid = d.escrow?.id; if (eid) setTrackEscrow(eid); else setMsg('✓ Commande passée.'); }
      else if (r.status === 402) setMsg('Solde Wallet insuffisant. Recharge ton Wallet.');
      else setMsg('Échec de la commande, réessaie.');
    } catch { setMsg('Erreur réseau.'); } finally { setOrdering(false); }
  };

  // ACHAT PROTÉGÉ (boutique / plat) : argent bloqué en escrow jusqu'à réception.
  const buyCart = async (authId?: string) => {
    if (!cartTotal || ordering) return;
    setOrdering(true); setMsg(null);
    try {
      const itemsArr = Object.entries(cart).map(([item_id, qty]) => ({ item_id, qty }));
      const isEat = shop?.kind === 'eat' || shop?.kind === 'plat_maison';
      const channel: 'eat' | 'boutique' = isEat ? 'eat' : 'boutique';
      const pos = await getPosition(); // position acheteur → calcul livraison par distance
      // Devis + confirmation (sauté si on rejoue après validation mobile).
      if (!authId) {
        const base = { type: isEat ? 'plat' : 'boutique', shop_key: shopKey, items: itemsArr, lat: pos?.lat, lng: pos?.lng, force_external: true };
        const qr = await fetch('/api/commerce/quote', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(base) }).then((x) => x.json()).catch(() => null);
        if (qr?.ok && qr.quote) {
          const z = qr.quote;
          const recap = `Articles : ${eur(z.article)}\nCommission Talk2Me (3%) : ${eur(z.commission)}\nFrais de paiement : ${eur(z.papi_fee)}${z.delivery ? `\nLivraison (transport) : ${eur(z.delivery)}` : ''}\n──────────────\nTotal à payer : ${eur(z.total)}\n\nConfirmer l'achat ?`;
          if (!window.confirm(recap)) { setOrdering(false); return; }
        }
      }
      // Card OS : le checkout passe par le RAIL UNIQUE (payForCard). La card = le panier
      // (channel + items) ; le prix reste résolu côté serveur.
      const repCard = { id: itemsArr[0]?.item_id || '', channel };
      const doBuy = (msisdn?: string) => payForCard(repCard, isEat ? 'order' : 'buy', {
        shopKey, items: itemsArr, lat: pos?.lat, lng: pos?.lng, forceExternal: true, payAuthId: authId, msisdn,
      });
      let d = await doBuy();
      // STEP-UP : achat depuis un ordinateur → validation mobile avant la page de paiement.
      if (d.needsMobileAuth) { setPayAuthId(d.authId || null); setOrdering(false); return; }
      if (!d.ok && (d.error === 'msisdn_required' || d.error === 'insufficient_funds')) {
        const msisdn = window.prompt('Ton numéro MVola (034 / 038…) pour payer :', '') || '';
        if (!msisdn) { setOrdering(false); return; }
        d = await doBuy(msisdn);
      }
      if (!d.ok) { setMsg(buyError(d.error)); return; }
      if (d.mode === 'paid') { setCart({}); setMsg('✅ Achat protégé : argent bloqué jusqu’à ce que tu confirmes la réception (dans ton Wallet), puis libéré au vendeur.'); return; }
      // PaPi DANS l'app (modal iframe, jamais de navigateur externe) — doctrine paiement.
      if (d.checkoutUrl) { setPayIntent(d.intentId || null); setPayUrl(d.checkoutUrl); return; }
      setCart({}); setMsg('📲 Demande de paiement envoyée sur ton téléphone. Confirme avec ton code MVola.');
    } catch { setMsg('Erreur réseau.'); } finally { setOrdering(false); }
  };

  // Fermeture du paiement PaPi → on vérifie le règlement (callback) puis on confirme.
  const closePay = async () => {
    const intent = payIntent;
    setPayUrl(null); setPayIntent(null);
    if (!intent) return;
    try {
      const s = await fetch(`/api/wallet/topup/status?intent=${encodeURIComponent(intent)}`, { cache: 'no-store' }).then((r) => r.json());
      if (s?.status === 'paid') { setCart({}); setMsg('✅ Paiement confirmé. Achat protégé — l’argent part au vendeur à la réception.'); }
    } catch { /* */ }
  };

  return (
    <div className="fixed inset-0 z-[70] bg-[#F5F6F8] text-[#2F343A] flex flex-col">
      {/* Header retiré : cover + carte enseigne (posé de Gemini) sont dans le scroll ci-dessous. */}
      <div className="flex-1 min-h-0 overflow-y-auto p-3" style={{ paddingBottom: (isEat && cartCount > 0) || (!isEat && !isMine) ? '6rem' : undefined }}>
        {/* POSE Gemini — cover mangue + carte enseigne qui chevauche */}
        <div style={{ position: 'relative', margin: '-12px -12px 0' }}>
          <div style={{ height: 170, background: 'linear-gradient(135deg,#FF7F11 0%,#FFB05C 100%)' }} />
          <button onClick={onClose} aria-label="Retour" style={{ position: 'absolute', top: 'calc(env(safe-area-inset-top) + 12px)', left: 12, width: 36, height: 36, borderRadius: '50%', background: 'rgba(255,255,255,.92)', display: 'grid', placeItems: 'center', border: 'none' }}><ChevronLeft className="w-6 h-6 text-[#2F343A]" /></button>
          <div style={{ background: '#FFFFFF', borderRadius: 18, boxShadow: '0 4px 16px rgba(47,52,58,.06)', padding: 20, margin: '-56px 20px 0', position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
            <div style={{ width: 80, height: 80, borderRadius: '50%', background: 'linear-gradient(135deg,#FFD9A8,#FF9A3D)', border: '4px solid #fff', marginTop: -56, marginBottom: 10, display: 'grid', placeItems: 'center', color: '#fff', fontFamily: "'Outfit',sans-serif", fontWeight: 700, fontSize: 32 }}>{(shop?.name || 'B')[0]?.toUpperCase()}</div>
            <div style={{ fontFamily: "'Outfit',sans-serif", fontWeight: 700, fontSize: 22, color: '#2F343A' }}>{shop?.name || 'Boutique'}</div>
            {shop?.description && <div style={{ fontSize: 14, color: '#6A7585', marginTop: 4 }}>{shop.description}</div>}
          </div>
        </div>
        {!isEat && <h2 style={{ fontFamily: "'Outfit',sans-serif", fontWeight: 600, fontSize: 18, margin: '18px 4px 10px', color: '#2F343A' }}>Ses articles</h2>}
        {/* Infos enseigne (resto enrichi) */}
        {isEat && (shop?.hours || shop?.address || shop?.phone || shop?.service_mode || shop?.prep_min) && (
          <div className="mb-3 px-1 space-y-1 text-[12px] text-[#6A7585]">
            {shop?.address && <div>{shop.address}</div>}
            {shop?.hours && <div>{shop.hours}</div>}
            {shop?.phone && <div>{shop.phone}</div>}
            {shop?.service_mode && (
              <div className="flex flex-wrap gap-1.5 pt-0.5">
                {shop.service_mode.split(',').filter(Boolean).map((m) => (
                  <span key={m} className="px-2 py-0.5 rounded-full bg-black/[0.06] text-[#6A7585] text-[11px]">{m === 'sur_place' ? 'Sur place' : m === 'emporter' ? 'À emporter' : 'Livraison'}</span>
                ))}
              </div>
            )}
            {(shop?.delivery_fee_cents != null || shop?.min_order_cents != null) && (
              <div className="text-[#9DAAB7]">
                {shop?.delivery_fee_cents != null && <>Livraison {eur(shop.delivery_fee_cents)}</>}
                {shop?.min_order_cents != null && <> · min. {eur(shop.min_order_cents)}</>}
                {shop?.prep_min != null && <> · prêt ~{shop.prep_min} min</>}
              </div>
            )}
          </div>
        )}
        {/* L'appli reconnaît que tu es en mode Drive → tu récupères toi-même */}
        {isEat && driveMode && (
          <div className="mb-3 rounded-xl border border-[#E7EAF0] bg-white px-3 py-2 text-[12px] text-[#6A7585] shadow-sm">
            <b>Mode Drive détecté</b> — pas besoin de livraison, tu es déjà sur la route. Tu <b>récupères ta commande toi-même</b>, prête à ton arrivée.
          </div>
        )}
        {isEat && !driveMode && <p className="text-[12px] text-[#9DAAB7] mb-2 px-1">Ajoute des plats au panier, puis commande.</p>}
        {loading ? (
          <div className="flex justify-center py-10 text-[#9DAAB7]"><Loader2 className="w-5 h-5 animate-spin" /></div>
        ) : items.length === 0 ? (
          <p className="text-center text-[#9DAAB7] text-[13px] py-10">{isEat ? 'Carte vide.' : 'Aucun article.'}</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
            {items.map((it) => (
              <div key={it.id} className="relative">
                {/* Card OS : l'article EST rendu par le moteur (lecteur Boutique). */}
                <SuperCardView card={readBoutiqueCard(it)} variant={shop?.kind === 'eat' || shop?.kind === 'plat_maison' ? 'eat' : 'product'} reveal={['media', 'title', 'price']} theme="light" />
                {/* Contrôles panier (le « Act ») en overlay — gérés par le lecteur. */}
                {!isMine && (
                  cart[it.id] ? (
                    <div className="absolute top-2 right-2 flex items-center gap-1.5 bg-white/95 shadow-md rounded-full px-1 py-0.5">
                      <button onClick={() => removeFromCart(it.id)} className="w-6 h-6 rounded-full bg-black/[0.06] text-[#2F343A] grid place-items-center text-[15px] leading-none">−</button>
                      <span className="text-[13px] font-bold text-[#2F343A] w-4 text-center">{cart[it.id]}</span>
                      <button onClick={() => addToCart(it.id)} className="w-6 h-6 rounded-full bg-[#FF7F11] text-white grid place-items-center text-[15px] leading-none">+</button>
                    </div>
                  ) : (
                    <button onClick={() => addToCart(it.id)} className="absolute top-2 right-2 w-7 h-7 rounded-full bg-[#FF7F11] text-white grid place-items-center text-[18px] leading-none shadow-md">+</button>
                  )
                )}
              </div>
            ))}
          </div>
        )}
        {msg && <p className="text-center text-[13px] text-[#6A7585] mt-4 px-4">{msg}</p>}
      </div>

      {isEat && cartCount > 0 && (
        <div className="absolute bottom-0 inset-x-0 z-10 px-3 pt-2 pb-4 bg-gradient-to-t from-[#F5F6F8] via-[#F5F6F8]/90 to-transparent">
          <button onClick={order} disabled={ordering}
            className="w-full flex items-center justify-between px-4 py-3 rounded-2xl bg-[#FF7F11] text-white font-bold text-[14px] shadow-[0_8px_20px_rgba(255,127,17,0.35)] disabled:opacity-60 active:scale-[0.99]">
            <span>{ordering ? 'Commande…' : `${driveMode ? 'Commander à récupérer' : 'Commander'} · ${cartCount} plat${cartCount > 1 ? 's' : ''}`}</span>
            <span>{eur(cartTotal)}</span>
          </button>
        </div>
      )}

      {/* Boutique (non-resto) : ACHETER (panier rempli) = achat protégé */}
      {!isEat && !isMine && cartCount > 0 && (
        <div className="absolute bottom-0 inset-x-0 z-10 px-3 pt-2 pb-[calc(env(safe-area-inset-bottom)+0.9rem)] bg-gradient-to-t from-[#F5F6F8] via-[#F5F6F8]/90 to-transparent">
          <button onClick={() => buyCart()} disabled={ordering}
            className="w-full flex items-center justify-between px-4 py-3.5 rounded-2xl bg-[#FF7F11] text-white font-bold text-[15px] shadow-[0_8px_20px_rgba(255,127,17,0.35)] disabled:opacity-60 active:scale-[0.99]">
            <span>{ordering ? 'Achat…' : `Acheter · ${cartCount} article${cartCount > 1 ? 's' : ''}`}</span>
            <span>{eur(cartTotal)}</span>
          </button>
          <p className="text-[#9DAAB7] text-[11px] text-center mt-1">🔒 Protégé : bloqué jusqu’à réception, puis versé au vendeur.</p>
        </div>
      )}

      {/* Boutique : contacter le vendeur (si panier vide, masqué si c'est ma boutique) */}
      {!isEat && !isMine && !loading && cartCount === 0 && (
        <div className="absolute bottom-0 inset-x-0 z-10 px-3 pt-2 pb-[calc(env(safe-area-inset-bottom)+0.9rem)] bg-gradient-to-t from-[#F5F6F8] via-[#F5F6F8]/95 to-transparent">
          <button onClick={contactSeller} disabled={contacting}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-white border border-[#E7EAF0] text-[#2F343A] font-semibold text-[14px] shadow-sm disabled:opacity-60 active:scale-[0.99]">
            {contacting ? <Loader2 className="w-5 h-5 animate-spin" /> : <MessageCircle className="w-5 h-5 text-[#FF7F11]" />}
            {contacting ? 'Ouverture du chat…' : 'Contacter le vendeur'}
          </button>
        </div>
      )}

      {/* Step-up : validation mobile avant la page de paiement (achat depuis un PC). */}
      {payAuthId && <MobilePayAuthModal authId={payAuthId} onApproved={(id) => { setPayAuthId(null); buyCart(id); }} onClose={() => setPayAuthId(null)} />}

      {/* Paiement PaPi DANS l'app — cadre brandé Talk2Me. */}
      {payUrl && <PaymentFrame url={payUrl} onClose={closePay} />}

      {/* Après commande : suivi scooter (livraison) OU « récupère toi-même » (mode Drive) */}
      {trackEscrow && (
        <DeliveryTracking escrowId={trackEscrow} restoName={shop?.name || 'Resto'} pickup={driveMode} onClose={() => { setTrackEscrow(null); onClose(); }} />
      )}
    </div>
  );
}
