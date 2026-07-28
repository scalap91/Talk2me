'use client';

/**
 * Talk2Me — Fiche boutique/resto plein écran (catalogue + commande). Partagé par
 * Annonces et Eat. Pour un resto (kind='eat') : panier + Commander → escrow.
 */

import { useEffect, useState } from 'react';
import { Loader2, ChevronLeft, ShoppingBag, Heart } from '@/lib/icons';
import { buyError } from '@/lib/client/buy-error';
import { formatMoney } from '@/lib/money';
import SuperCardView from '@/components/cards/SuperCardView';
import { parseCard, makeCard, type SuperCard } from '@/lib/cards/supercard';
import { payForCard } from '@/lib/client/pay-for-card';
import CheckoutSheet from '@/components/feed/CheckoutSheet';
import { getCart, saveCart } from '@/lib/client/cart-store';

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

export default function BoutiqueSheet({ shopKey, shopId, focusItemId, postId, postKind, onClose }: { shopKey?: string; shopId?: string; focusItemId?: string; postId?: string; postKind?: string; onClose: () => void }) {
  const [me, setMe] = useState<string | null>(null);
  const [fav, setFav] = useState(false);
  const [favBusy, setFavBusy] = useState(false);
  const [shop, setShop] = useState<{ id?: string; name: string; description: string | null; kind?: string; owner_id?: string; public_key?: string | null; address?: string | null; phone?: string | null; hours?: string | null; service_mode?: string | null; delivery_fee_cents?: number | null; min_order_cents?: number | null; prep_min?: number | null; is_favorite?: boolean; vitrine_post_id?: string | null } | null>(null);
  const [items, setItems] = useState<{ id: string; image_url: string; label: string | null; price_cents: number; description?: string | null; section?: string | null; dotcard?: string | null; quantity?: number | null }[]>([]);
  const [loading, setLoading] = useState(true);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [cartOpen, setCartOpen] = useState(false); // vue panier (icône près du ❤) — jumeau du natif
  const [ordering, setOrdering] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false); // feuille de commande Retrait/Livraison (parcours unifié)
  const [trackEscrow, setTrackEscrow] = useState<string | null>(null); // suivi livraison ouvert
  const [driveMode, setDriveMode] = useState(false); // l'user est chauffeur EN LIGNE → récupère lui-même
  const [payUrl, setPayUrl] = useState<string | null>(null);     // page PaPi DANS l'app (iframe)
  const [payIntent, setPayIntent] = useState<string | null>(null);
  const [payAuthId, setPayAuthId] = useState<string | null>(null); // step-up validation mobile (desktop)
  const [askMsisdn, setAskMsisdn] = useState(false); // le paiement Mobile Money exige le n° → champ DANS l'app
  const [msisdnVal, setMsisdnVal] = useState('');
  const [showQr, setShowQr] = useState(false); // QR de conversion (Pascal 2026-07-27) : le proprio l'imprime → le client scanne → fiche in-app → commande escrow.

  // L'appli RECONNAÎT le mode Drive (Pascal) : si tu es chauffeur en ligne, pas de
  // livraison — tu vas chercher ta commande toi-même (tu es déjà sur la route).
  useEffect(() => {
    fetch('/api/drive/driver', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => { if (d?.profile?.is_online) setDriveMode(true); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    // Ouverture par CLÉ (partage) OU par ID (depuis le feed, la card ne porte que le shopId).
    const url = shopKey ? `/api/simple-shop/by-key?key=${encodeURIComponent(shopKey)}` : `/api/simple-shop/${encodeURIComponent(shopId || '')}`;
    fetch(url, { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => { if (d?.shop) { setShop(d.shop); setItems(d.items || []); setFav(!!d.shop.is_favorite); if (d.shop.id) setCart(getCart(d.shop.id)); } })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [shopKey, shopId]);

  useEffect(() => {
    fetch('/api/auth/me', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((d) => setMe(d?.user?.id || null)).catch(() => {});
  }, []);

  // Panier PERSISTANT : sauvegardé à chaque changement (survit fermeture/refresh). Lu par le profil.
  useEffect(() => {
    if (shop?.id) saveCart(shop.id, cart, { shopName: shop.name, shopKey: shop.public_key, kind: shop.kind });
  }, [cart, shop?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const eur = (c: number) => formatMoney(c);
  const isEat = shop?.kind === 'eat';
  const isMine = !!me && !!shop?.owner_id && me === shop.owner_id;

  // Ma boutique : on ne peut pas s'acheter à soi-même (startOrder → cannot_buy_own).
  // Au lieu d'un bouton muet, on donne un RETOUR clair : secousse + son sourd (thud).
  const [selfBump, setSelfBump] = useState(false);
  const playThud = () => {
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      const ctx = new AC();
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(130, ctx.currentTime);
      o.frequency.exponentialRampToValueAtTime(52, ctx.currentTime + 0.14);
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.32, ctx.currentTime + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.19);
      o.connect(g); g.connect(ctx.destination);
      o.start(); o.stop(ctx.currentTime + 0.2);
      o.onended = () => { try { ctx.close(); } catch { /* */ } };
    } catch { /* pas de son = pas grave */ }
  };
  const denySelfBuy = () => {
    if (selfBump) return;
    playThud();
    if (navigator.vibrate) { try { navigator.vibrate(35); } catch { /* */ } }
    setSelfBump(true);
    setTimeout(() => setSelfBump(false), 460);
  };

  // Favori boutique — même bascule que le natif (♥ dans le header). POST /api/simple-shop/[id]/favorite.
  const toggleFav = async () => {
    const sid = shopId || shop?.id;
    if (favBusy || !sid) return;
    const next = !fav;
    setFav(next); setFavBusy(true);
    try {
      const r = await fetch(`/api/simple-shop/${encodeURIComponent(sid)}/favorite`, { method: 'POST' });
      const d = await r.json();
      if (typeof d?.favorited === 'boolean') setFav(d.favorited);
      else if (!r.ok) setFav(!next);
    } catch { setFav(!next); } finally { setFavBusy(false); }
  };
  // (commentaires retirés de la boutique — anti-désintermédiation. Ils restent sur le POST du feed.)

  // Quantité BORNÉE au stock (item.quantity) : fini le « n'importe quelle valeur ». Stock non
  // défini (null/0) → pas de limite. La quantité du panier est reprise telle quelle au paiement.
  const addToCart = (id: string) => setCart((c) => {
    const it = items.find((x) => x.id === id);
    const stock = (typeof it?.quantity === 'number' && it.quantity > 0) ? it.quantity : Infinity;
    return { ...c, [id]: Math.min((c[id] || 0) + 1, stock) };
  });
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
  const buyCart = async (authId?: string, msisdn?: string) => {
    if (!cartTotal || ordering) return;
    setOrdering(true); setMsg(null);
    try {
      const itemsArr = Object.entries(cart).map(([item_id, qty]) => ({ item_id, qty }));
      const isEat = shop?.kind === 'eat' || shop?.kind === 'plat_maison';
      const channel: 'eat' | 'boutique' = isEat ? 'eat' : 'boutique';
      // best-effort → calcul livraison. Course avec un cap 3 s : si la géoloc gèle dans la WebView,
      // on continue SANS position (jamais de bouton coincé sur « Achat… »).
      const pos = await Promise.race([getPosition(), new Promise<null>((r) => setTimeout(() => r(null), 3000))]);
      // Card OS : checkout par le RAIL UNIQUE (payForCard). PLUS de window.confirm / window.prompt :
      // bloqués dans la WebView de l'APK → l'achat s'arrêtait en silence. Le n° Mobile Money se
      // saisit désormais dans un CHAMP de l'app (askMsisdn), pas dans un pop-up cassé. (Pascal 2026-07-10)
      const repCard = { id: itemsArr[0]?.item_id || '', channel };
      // Identifie la boutique par la clé (partage) OU par la clé récupérée si ouvert par id (feed) OU par id.
      const d = await payForCard(repCard, isEat ? 'order' : 'buy', {
        shopKey: shopKey || shop?.public_key || undefined, shopId: shopId || undefined,
        items: itemsArr, lat: pos?.lat, lng: pos?.lng, forceExternal: true, payAuthId: authId, msisdn,
      });
      // STEP-UP : achat depuis un ordinateur → validation mobile avant la page de paiement.
      if (d.needsMobileAuth) { setPayAuthId(d.authId || null); setOrdering(false); return; }
      // Le paiement Mobile Money exige le numéro → on ouvre le CHAMP dans l'app (pas window.prompt).
      if (!d.ok && d.error === 'msisdn_required') { setAskMsisdn(true); setOrdering(false); return; }
      if (!d.ok && !d.checkoutUrl) { setMsg(buyError(d.error)); return; }
      if (d.mode === 'paid') { setCart({}); setMsg('✅ Achat protégé : argent bloqué jusqu’à la réception, puis versé au vendeur.'); return; }
      // PaPi DANS l'app (modal iframe, jamais de navigateur externe) — doctrine paiement.
      if (d.checkoutUrl) { setPayIntent(d.intentId || null); setPayUrl(d.checkoutUrl); return; }
      setCart({}); setMsg('📲 Demande de paiement envoyée. Confirme sur ton téléphone.');
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
      <div className="flex-1 min-h-0 overflow-y-auto p-3" style={{ paddingBottom: (cartCount > 0) || (!isEat && isMine) ? '6rem' : undefined }}>
        {isEat ? (
          /* POSE Gemini — cover mangue + carte enseigne qui chevauche (resto/plat uniquement) */
          <div style={{ position: 'relative', margin: '-12px -12px 0' }}>
            <div style={{ height: 170, background: 'linear-gradient(135deg,#FF7F11 0%,#FFB05C 100%)' }} />
            <button onClick={onClose} aria-label="Retour" style={{ position: 'absolute', top: 'calc(env(safe-area-inset-top) + 12px)', left: 12, width: 36, height: 36, borderRadius: '50%', background: 'rgba(255,255,255,.92)', display: 'grid', placeItems: 'center', border: 'none' }}><ChevronLeft className="w-6 h-6 text-[#2F343A]" /></button>
            <div style={{ background: '#FFFFFF', borderRadius: 18, boxShadow: '0 4px 16px rgba(47,52,58,.06)', padding: 20, margin: '-56px 20px 0', position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
              <div style={{ width: 80, height: 80, borderRadius: '50%', background: 'linear-gradient(135deg,#FFD9A8,#FF9A3D)', border: '4px solid #fff', marginTop: -56, marginBottom: 10, display: 'grid', placeItems: 'center', color: '#fff', fontFamily: "'Outfit',sans-serif", fontWeight: 700, fontSize: 32 }}>{(shop?.name || 'B')[0]?.toUpperCase()}</div>
              <div style={{ fontFamily: "'Outfit',sans-serif", fontWeight: 700, fontSize: 22, color: '#2F343A' }}>{shop?.name || 'Boutique'}</div>
              {shop?.description && <div style={{ fontSize: 14, color: '#6A7585', marginTop: 4 }}>{shop.description}</div>}
            </div>
          </div>
        ) : (
          /* BOUTIQUE — reproduit EXACTEMENT le natif : header blanc sobre (retour + nom + ♥ favoris). */
          <div style={{ position: 'sticky', top: 0, zIndex: 6, margin: '-12px -12px 0', display: 'flex', alignItems: 'center', gap: 6, background: '#fff', borderBottom: '1px solid #EEF0F2', padding: 'calc(env(safe-area-inset-top) + 8px) 8px 8px' }}>
            <button onClick={onClose} aria-label="Retour" style={{ width: 40, height: 40, borderRadius: '50%', display: 'grid', placeItems: 'center', border: 'none', background: 'transparent' }}><ChevronLeft className="w-6 h-6 text-[#2F343A]" /></button>
            <div style={{ flex: 1, fontFamily: "'Outfit',sans-serif", fontWeight: 800, fontSize: 17, color: '#2F343A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{shop?.name || 'Boutique'}</div>
            {/* Panier — près du ❤ (jumeau du natif). Pastille = quantité. Ouvre la vue panier. */}
            <button onClick={() => cartCount > 0 && setCartOpen(true)} aria-label="Panier" style={{ position: 'relative', width: 40, height: 40, borderRadius: '50%', display: 'grid', placeItems: 'center', border: 'none', background: 'transparent', opacity: cartCount > 0 ? 1 : 0.5 }}>
              <ShoppingBag className="w-6 h-6 text-[#2F343A]" />
              {cartCount > 0 && <span style={{ position: 'absolute', top: 4, right: 4, minWidth: 16, height: 16, padding: '0 4px', borderRadius: 8, background: '#FF7F11', color: '#fff', fontSize: 10, fontWeight: 800, display: 'grid', placeItems: 'center' }}>{cartCount}</span>}
            </button>
            <button onClick={toggleFav} disabled={favBusy} aria-label="Favori" style={{ width: 40, height: 40, borderRadius: '50%', display: 'grid', placeItems: 'center', border: 'none', background: 'transparent' }}>
              {favBusy ? <Loader2 className="w-5 h-5 animate-spin text-[#9DAAB7]" /> : <Heart weight={fav ? 'fill' : 'regular'} className="w-6 h-6" style={{ color: fav ? '#EC4899' : '#2F343A' }} />}
            </button>
            {/* Pas de commentaires DANS la boutique (anti-désintermédiation : acheteur/vendeur ne s'arrangent
                pas en direct → on garde la commission). Les commentaires restent sur le POST du feed. Pascal 2026-07-23. */}
          </div>
        )}
        {/* QR DE CONVERSION (Pascal 2026-07-27) : le proprio l'imprime → client scanne → SA fiche in-app → commande escrow. */}
        {isMine && shop?.public_key && (
          <button type="button" onClick={() => setShowQr(true)} className="w-full mb-3 flex items-center gap-3 rounded-xl border border-[#FF7F11]/40 bg-[#FFF6EE] px-3 py-2.5 text-left active:scale-[0.99]">
            <span className="text-[22px]">🔳</span>
            <span className="flex-1 min-w-0">
              <span className="block text-[13.5px] font-bold text-[#2F343A]">Mon QR — fais venir tes clients dans l&apos;app</span>
              <span className="block text-[11.5px] text-[#9DAAB7]">Imprime-le sur ton menu / ta vitrine : on scanne → ta fiche → commande protégée.</span>
            </span>
          </button>
        )}
        {/* Infos enseigne (resto enrichi) */}
        {isEat && (shop?.hours || shop?.address || shop?.service_mode || shop?.prep_min) && (
          <div className="mb-3 px-1 space-y-1 text-[12px] text-[#6A7585]">
            {shop?.address && <div>{shop.address}</div>}
            {shop?.hours && <div>{shop.hours}</div>}
            {/* Téléphone RETIRÉ de l'affichage (Pascal 2026-07-27) : anti-désintermédiation — un n° en clair = fuite escrow. Contact = conversation in-app. */}
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
            {/* focusItemId = article attaché SEUL : on n'affiche QUE cet article (pas toute la boutique). Pascal 2026-07-14 */}
            {(focusItemId ? items.filter((it) => it.id === focusItemId) : items).map((it) => {
              // Boutique : contrôle panier « Ajouter » / (− qty +) rendu DANS la carte par le lecteur (natif).
              const cartSlot = (!isMine && !isEat) ? (
                cart[it.id] ? (
                  <div className="flex items-center justify-between">
                    <button onClick={() => removeFromCart(it.id)} className="w-8 h-8 rounded-full bg-[#FF7F11]/[0.12] text-[#FF7F11] grid place-items-center text-[18px] leading-none">−</button>
                    <span className="text-[14px] font-extrabold text-[#2F343A]">{cart[it.id]}</span>
                    <button onClick={() => addToCart(it.id)} className="w-8 h-8 rounded-full bg-[#FF7F11]/[0.12] text-[#FF7F11] grid place-items-center text-[18px] leading-none">+</button>
                  </div>
                ) : (
                  <button onClick={() => addToCart(it.id)} className="w-full h-8 rounded-full border border-[#FF7F11] text-[#FF7F11] font-bold text-[12.5px] active:scale-[0.98]">Ajouter</button>
                )
              ) : undefined;
              return (
                <div key={it.id} className="relative">
                  {/* Card OS : l'article EST rendu par le moteur (lecteur Boutique). Le « Act » panier est
                      injecté DANS la carte via cartSlot (boutique) ; Eat garde le ➕ en overlay. */}
                  <SuperCardView card={readBoutiqueCard(it)} variant={shop?.kind === 'eat' || shop?.kind === 'plat_maison' ? 'eat' : 'product'} reveal={['media', 'title', 'price']} theme="light" cartSlot={cartSlot} />
                  {!isMine && isEat && (
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
              );
            })}
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

      {/* Boutique (non-resto) : ACHETER (panier rempli) = achat protégé. Bouton IDENTIQUE au natif :
          « Acheter · <total> · paiement protégé » centré. Plus de « Contacter le vendeur » (anti-désintermédiation). */}
      {!isEat && !isMine && cartCount > 0 && (
        <div className="absolute bottom-0 inset-x-0 z-10 px-3 pt-2 pb-[calc(env(safe-area-inset-bottom)+0.9rem)] bg-gradient-to-t from-[#F5F6F8] via-[#F5F6F8]/90 to-transparent">
          <button onClick={() => setCheckoutOpen(true)} disabled={ordering}
            className="w-full flex items-center justify-center px-4 py-3.5 rounded-2xl bg-[#FF7F11] text-white font-extrabold text-[15px] shadow-[0_8px_20px_rgba(255,127,17,0.35)] disabled:opacity-60 active:scale-[0.99]"
            style={{ fontFamily: "'Outfit',sans-serif" }}>
            {ordering ? 'Achat…' : `Commander · ${eur(cartTotal)}`}
          </button>
        </div>
      )}

      {/* Vue PANIER (icône près du ❤) — jumeau du natif _openCart. */}
      {cartOpen && (
        <div onClick={() => setCartOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 140, background: 'rgba(20,20,26,.5)', display: 'flex', alignItems: 'flex-end' }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', width: '100%', borderRadius: '22px 22px 0 0', padding: '14px 16px calc(16px + env(safe-area-inset-bottom))', maxHeight: '80vh', overflowY: 'auto' }}>
            <div style={{ width: 40, height: 4, background: 'rgba(0,0,0,.15)', borderRadius: 2, margin: '0 auto 14px' }} />
            <div style={{ fontFamily: "'Outfit',sans-serif", fontWeight: 800, fontSize: 18, color: '#1A1D22', marginBottom: 12 }}>Ton panier</div>
            {items.filter((it) => cart[it.id]).length === 0 ? (
              <div style={{ color: '#6A7585', padding: '20px 0' }}>Panier vide.</div>
            ) : items.filter((it) => cart[it.id]).map((it) => (
              <div key={it.id} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, color: '#1A1D22', fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.label}</div>
                  <div style={{ color: '#FF7F11', fontWeight: 800, fontSize: 12.5 }}>{eur(it.price_cents)}</div>
                </div>
                <button onClick={() => removeFromCart(it.id)} aria-label="Moins" style={{ width: 28, height: 28, borderRadius: '50%', border: 'none', background: 'rgba(255,127,17,.12)', color: '#FF7F11', fontWeight: 800, fontSize: 18, lineHeight: 1 }}>−</button>
                <span style={{ fontWeight: 800, minWidth: 20, textAlign: 'center', color: '#1A1D22' }}>{cart[it.id]}</span>
                <button onClick={() => addToCart(it.id)} aria-label="Plus" style={{ width: 28, height: 28, borderRadius: '50%', border: 'none', background: 'rgba(255,127,17,.12)', color: '#FF7F11', fontWeight: 800, fontSize: 18, lineHeight: 1 }}>+</button>
              </div>
            ))}
            <div style={{ borderTop: '1px solid #EEF0F2', margin: '14px 0', paddingTop: 12, display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#6A7585', fontWeight: 600 }}>Sous-total</span>
              <span style={{ fontWeight: 800, color: '#1A1D22', fontSize: 16 }}>{eur(cartTotal)}</span>
            </div>
            <button onClick={() => { setCartOpen(false); setCheckoutOpen(true); }} disabled={ordering || cartCount === 0}
              style={{ width: '100%', height: 50, borderRadius: 14, border: 'none', background: '#FF7F11', color: '#fff', fontFamily: "'Outfit',sans-serif", fontWeight: 800, fontSize: 15, opacity: (ordering || cartCount === 0) ? 0.6 : 1 }}>
              {ordering ? 'Achat…' : `Commander · ${eur(cartTotal)}`}
            </button>
          </div>
        </div>
      )}

      {/* MA boutique : indication claire « on ne peut pas acheter la sienne » + bouton
          qui secoue (effet) + son sourd au tap. Remplace le bouton muet/absent. */}
      {!isEat && isMine && !loading && (
        <div className="absolute bottom-0 inset-x-0 z-10 px-3 pt-2 pb-[calc(env(safe-area-inset-bottom)+0.9rem)] bg-gradient-to-t from-[#F5F6F8] via-[#F5F6F8]/95 to-transparent">
          <style>{`@keyframes t2mSelfBump{0%,100%{transform:translateX(0)}12%{transform:translateX(-9px)}26%{transform:translateX(9px)}42%{transform:translateX(-6px)}58%{transform:translateX(6px)}74%{transform:translateX(-3px)}88%{transform:translateX(3px)}}`}</style>
          <button type="button" onClick={denySelfBuy} aria-label="Tu ne peux pas acheter ta propre boutique"
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-[#EDEFF3] text-[#9DAAB7] font-bold text-[15px] border border-[#E7EAF0]"
            style={selfBump ? { animation: 't2mSelfBump 0.46s ease' } : undefined}>
            <ShoppingBag className="w-5 h-5" /> Acheter
          </button>
          <p className="text-[#9DAAB7] text-[12px] text-center mt-1.5">C’est <b className="text-[#6A7585]">ta boutique</b> — tu ne peux pas l’acheter toi-même. Partage-la pour vendre 🙂</p>
        </div>
      )}

      {/* Numéro Mobile Money — CHAMP dans l'app (remplace window.prompt, cassé en WebView). */}
      {askMsisdn && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 130, background: 'rgba(20,20,26,.5)', display: 'grid', placeItems: 'center', padding: 20 }} onClick={() => setAskMsisdn(false)}>
          <div style={{ background: '#fff', borderRadius: 18, padding: 22, maxWidth: 340, width: '100%' }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontFamily: "'Outfit',sans-serif", fontWeight: 700, fontSize: 18, margin: '0 0 6px' }}>Ton numéro Mobile Money</h3>
            <p style={{ fontSize: 13.5, color: '#6A7585', margin: '0 0 14px', lineHeight: 1.5 }}>Pour payer <b>{eur(cartTotal)}</b> par MVola / Orange / Airtel Money.</p>
            <input
              type="tel" inputMode="tel" autoFocus value={msisdnVal}
              onChange={(e) => setMsisdnVal(e.target.value.replace(/[^\d+]/g, ''))}
              placeholder="034 12 345 67"
              style={{ width: '100%', padding: '12px 14px', borderRadius: 12, border: '1px solid #E7EAF0', fontSize: 16, marginBottom: 14 }}
            />
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setAskMsisdn(false)} style={{ flex: 1, padding: 12, borderRadius: 12, border: '1px solid #E7EAF0', background: '#fff', fontWeight: 600, fontSize: 14 }}>Annuler</button>
              <button
                onClick={() => { const m = msisdnVal.trim(); if (m.length < 6) return; setAskMsisdn(false); buyCart(undefined, m); }}
                disabled={msisdnVal.trim().length < 6}
                style={{ flex: 1, padding: 12, borderRadius: 12, border: 'none', background: '#FF7F11', color: '#fff', fontWeight: 700, fontSize: 14, opacity: msisdnVal.trim().length < 6 ? 0.5 : 1 }}
              >Payer</button>
            </div>
          </div>
        </div>
      )}

      {/* QR DE CONVERSION — image générée par /api/public/qr (existant), cible = fiche publique /b/<clé>. */}
      {showQr && shop?.public_key && (() => {
        const target = `${typeof window !== 'undefined' ? window.location.origin : ''}/b/${shop.public_key}`;
        const qr = `/api/public/qr?url=${encodeURIComponent(target)}`;
        return (
          <div style={{ position: 'fixed', inset: 0, zIndex: 135, background: 'rgba(20,20,26,.6)', display: 'grid', placeItems: 'center', padding: 20 }} onClick={() => setShowQr(false)}>
            <div style={{ background: '#fff', borderRadius: 20, padding: 22, maxWidth: 340, width: '100%', textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
              <h3 style={{ fontFamily: "'Outfit',sans-serif", fontWeight: 800, fontSize: 18, margin: '0 0 4px' }}>Mon QR — {shop.name}</h3>
              <p style={{ fontSize: 12.5, color: '#6A7585', margin: '0 0 14px', lineHeight: 1.5 }}>Colle-le sur ton menu / ta vitrine. Le client scanne → il tombe sur <b>ta fiche dans l&apos;app</b> → il commande (paiement protégé).</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qr} alt="QR de ma fiche" style={{ width: 240, height: 240, margin: '0 auto', display: 'block', borderRadius: 12 }} />
              <div style={{ fontSize: 11, color: '#9DAAB7', margin: '10px 0 14px', wordBreak: 'break-all' }}>{target}</div>
              <a href={qr} download={`qr-${shop.public_key}.png`} style={{ display: 'inline-block', padding: '11px 20px', borderRadius: 12, background: '#FF7F11', color: '#fff', fontWeight: 700, fontSize: 14, textDecoration: 'none' }}>Télécharger le QR</a>
              <button onClick={() => setShowQr(false)} style={{ display: 'block', margin: '12px auto 0', color: '#9DAAB7', fontSize: 13, background: 'none', border: 'none' }}>Fermer</button>
            </div>
          </div>
        );
      })()}

      {/* Step-up : validation mobile avant la page de paiement (achat depuis un PC). */}
      {payAuthId && <MobilePayAuthModal authId={payAuthId} onApproved={(id) => { setPayAuthId(null); buyCart(id); }} onClose={() => setPayAuthId(null)} />}

      {/* Paiement PaPi DANS l'app — cadre brandé Talk2Me. */}
      {payUrl && <PaymentFrame url={payUrl} onClose={closePay} />}

      {/* Feuille de COMMANDE (Retrait / Livraison) — parcours unifié web+natif → escrow réel. */}
      {checkoutOpen && shop && (
        <CheckoutSheet
          shop={{ id: shop.id, name: shop.name, public_key: shop.public_key, kind: shop.kind }}
          items={items}
          cart={cart}
          onClose={() => setCheckoutOpen(false)}
          onPaid={(m) => { setCheckoutOpen(false); setCart({}); setMsg(m); }}
        />
      )}

      {/* Après commande : suivi scooter (livraison) OU « récupère toi-même » (mode Drive) */}
      {trackEscrow && (
        <DeliveryTracking escrowId={trackEscrow} onClose={() => { setTrackEscrow(null); onClose(); }} />
      )}
    </div>
  );
}
