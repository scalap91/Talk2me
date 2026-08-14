'use client';

/* eslint-disable @next/next/no-img-element */
/**
 * Talk2Me — Détail d'une annonce déposée (Pascal 2026-06-11). On rentre DANS
 * l'annonce, et de là on peut « Voir la boutique » (si elle est rattachée) et
 * « Contacter le vendeur ». L'annonce est la porte d'entrée, pas l'inverse.
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { X, MessageCircle, Store, Loader2, MapPin, ShoppingBag, Lock, Pencil, CalendarCheck } from '@/lib/icons';
import { buyError } from '@/lib/client/buy-error';
import { formatMoney } from '@/lib/money';
import RentalSheet from '@/components/drive/RentalSheet';
import MobilePayAuthModal from '@/components/pay/MobilePayAuthModal';
import PaymentFrame from '@/components/pay/PaymentFrame';
import SuperCardView from '@/components/cards/SuperCardView';
import CardDevButton from '@/components/dev/CardDevButton';
import { parseCard, type SuperCard } from '@/lib/cards/supercard';
import { fromAnnonceItem } from '@/lib/cards/adapt';
import { payForCard } from '@/lib/client/pay-for-card';

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
  rental?: boolean;
  driver_option?: string | null;
  photos?: string[] | null;
  attributes?: Record<string, string> | null;
  quantity?: number | null;
  deposit_cents?: number | null;
  reserved?: boolean;
  dotcard?: string | null; // Card OS : le `.card` stocké (source de vérité du lecteur)
}

/** Card OS : la fiche LIT le `.card` stocké ; fallback adaptateur pour les vieilles annonces. */
function detailToCard(a: AnnonceDetail): SuperCard {
  if (typeof a.dotcard === 'string' && a.dotcard) {
    const r = parseCard(a.dotcard);
    if (r.ok && r.card) return r.card;
  }
  return fromAnnonceItem({
    id: a.id, media_url: a.media_url, title: a.title, category: a.category,
    price_label: a.price_label, description: a.description, city: a.city,
    rental: a.rental, driver_option: a.driver_option, photos: a.photos,
    attributes: a.attributes, quantity: a.quantity, deposit_cents: a.deposit_cents,
  });
}

// Libellés lisibles pour les clés d'attributs structurés.
const ATTR_LABELS: Record<string, string> = {
  marque: 'Marque', modele: 'Modèle', annee: 'Année', km: 'Kilométrage', carburant: 'Carburant',
  boite: 'Boîte', portes: 'Portes', places: 'Places', etat: 'État', transaction: 'Transaction',
  type: 'Type', surface: 'Surface', pieces: 'Pièces', chambres: 'Chambres', meuble: 'Meublé',
  stockage: 'Stockage', debloque: 'Débloqué', garantie: 'Garantie', taille: 'Taille', couleur: 'Couleur',
  contrat: 'Contrat', secteur: 'Secteur', experience: 'Expérience', remote: 'Télétravail', dispo: 'Disponibilité',
};

export default function AnnonceDetailSheet({
  annonce, onClose, onViewShop, isMine, onEdit,
}: { annonce: AnnonceDetail; onClose: () => void; onViewShop: (shopKey: string) => void; isMine?: boolean; onEdit?: () => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [showBooking, setShowBooking] = useState(false); // location : calendrier de réservation
  const [payUrl, setPayUrl] = useState<string | null>(null);     // page PaPi DANS l'app (iframe)
  const [payIntent, setPayIntent] = useState<string | null>(null);
  const [payAuthId, setPayAuthId] = useState<string | null>(null); // step-up : validation mobile desktop
  const [boostPick, setBoostPick] = useState(false);               // sélecteur de pack premium
  const [boostPending, setBoostPending] = useState<string | null>(null); // pack en attente de validation mobile
  const [boosting, setBoosting] = useState(false);

  // PREMIUM : met l'annonce en avant via PaPi (pas de wallet). Step-up desktop géré.
  const doBoost = async (packKey: string, authId?: string) => {
    if (boosting) return;
    setBoosting(true);
    try {
      const d = await fetch('/api/annonces/boost', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: annonce.id, pack: packKey, pay_auth_id: authId }) }).then((x) => x.json());
      if (d?.needs_mobile_auth) { setBoostPending(packKey); setPayAuthId(d.auth_id); return; }
      if (!d?.ok) { alert('Mise en avant impossible, réessaie.'); return; }
      if (d.checkout_url) { setBoostPick(false); setPayIntent(d.intent_id || null); setPayUrl(d.checkout_url); }
    } catch { alert('Erreur réseau.'); } finally { setBoosting(false); }
  };
  const BOOST_OPTIONS: { key: string; label: string; ar: number }[] = [
    { key: '7j', label: '7 jours', ar: 5000 }, { key: '15j', label: '15 jours', ar: 9000 }, { key: '30j', label: '30 jours', ar: 15000 },
  ];

  // ACOMPTE de réservation : l'acheteur verse l'acompte → escrow vendeur + bien réservé.
  const [reservePending, setReservePending] = useState(false);
  const doReserve = async (authId?: string) => {
    if (busy) return;
    setBusy(true);
    try {
      // Card OS : acompte via le RAIL UNIQUE (payForCard, action 'reserve').
      const d = await payForCard(detailToCard(annonce), 'reserve', { payAuthId: authId });
      if (d?.needsMobileAuth) { setReservePending(true); setPayAuthId(d.authId || null); return; }
      if (!d?.ok) { alert(d?.error === 'already_reserved' ? 'Ce bien vient d’être réservé.' : 'Réservation impossible, réessaie.'); return; }
      if (d.checkoutUrl) { setPayIntent(d.intentId || null); setPayUrl(d.checkoutUrl); }
    } catch { alert('Erreur réseau.'); } finally { setBusy(false); }
  };

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
  const acheter = async (authId?: string) => {
    if (busy) return;
    setBusy(true);
    try {
      // 1) Devis + confirmation AVANT de débiter (sauté si on rejoue après validation mobile).
      if (!authId) {
        const q = await fetch('/api/commerce/quote', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'annonce', annonce_id: annonce.id }) }).then((x) => x.json()).catch(() => null);
        if (q?.ok && q.quote) {
          const z = q.quote;
          const recap = `Article : ${formatMoney(z.article)}\nCommission Talk2Me (3%) : ${formatMoney(z.commission)}\nFrais de paiement : ${formatMoney(z.papi_fee)}${z.delivery ? `\nLivraison : ${formatMoney(z.delivery)}` : ''}\n──────────────\nTotal à payer : ${formatMoney(z.total)}\n\nConfirmer l'achat ?`;
          if (!window.confirm(recap)) { setBusy(false); return; }
        }
      }
      // Card OS : achat via le RAIL UNIQUE (payForCard). channel='annonce' → même rail
      // que boutique/eat ; prix résolu serveur ; paiement PaPi DANS l'app.
      const d = await payForCard(detailToCard(annonce), 'buy', { payAuthId: authId, forceExternal: true });
      // STEP-UP : achat depuis un ordinateur → on attend la validation sur le mobile.
      if (d.needsMobileAuth) { setPayAuthId(d.authId || null); setBusy(false); return; }
      if (!d.ok) { alert(buyError(d.error)); setBusy(false); return; }
      if (d.checkoutUrl) { setPayIntent(d.intentId || null); setPayUrl(d.checkoutUrl); setBusy(false); return; }
      onClose();
      alert('✅ Achat enregistré.');
    } catch { setBusy(false); }
  };

  // Fermeture du paiement → on vérifie le règlement (callback PaPi) puis on confirme.
  const closePay = async () => {
    const intent = payIntent;
    setPayUrl(null); setPayIntent(null);
    if (!intent) return;
    try {
      const s = await fetch(`/api/wallet/topup/status?intent=${encodeURIComponent(intent)}`, { cache: 'no-store' }).then((r) => r.json());
      if (s?.status === 'paid') { alert('✅ Paiement confirmé. Achat protégé — l’argent part au vendeur à la réception.'); onClose(); }
    } catch { /* */ }
  };

  return (
    <div className="fixed inset-0 z-[75] bg-black/70 backdrop-blur-sm flex items-end md:items-center md:justify-center" onClick={onClose}>
      {annonce.id && <CardDevButton cardId={annonce.id} className="absolute right-1.5 top-1.5 z-40" />}
      <div className="w-full md:max-w-md max-h-[92dvh] md:max-h-[88dvh] overflow-y-auto bg-[#101015] rounded-t-3xl md:rounded-2xl border-t md:border border-white/10" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-3 bg-[#101015]/95 backdrop-blur border-b border-white/8">
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-red-500/15 text-red-200">{annonce.category}</span>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/10 grid place-items-center text-white/80"><X className="w-4 h-4" /></button>
        </div>

        <div className="pb-[calc(env(safe-area-inset-bottom)+1rem)]">
          {/* Card OS : présentation rendue par le MOTEUR (lecteur Annonces, variante detail).
              Galerie + titre + prix + lieu + description + specs = facettes du `.card`. */}
          <div className="p-4">
            <SuperCardView card={detailToCard(annonce)} variant="detail" reveal={['media', 'title', 'price', 'place', 'text', 'specs']} />
            {/* Infos T2M HORS card (vendeur, stock) — présentation du lecteur. */}
            {(annonce.seller || typeof annonce.quantity === 'number') && (
              <div className="flex items-center gap-3 mt-2">
                {annonce.seller && <span className="text-[12px] text-white/50">par {annonce.seller}</span>}
                {typeof annonce.quantity === 'number' && (
                  <span className={`text-[11px] px-2 py-0.5 rounded-full ${annonce.quantity > 0 ? 'bg-emerald-500/15 text-emerald-200' : 'bg-red-500/15 text-red-200'}`}>
                    {annonce.quantity > 0 ? `${annonce.quantity} en stock` : 'Épuisé'}
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="px-4 pt-2 space-y-2">
            {/* LOCATION → Réserver (calendrier). VENTE → Acheter (paiement protégé). */}
            {annonce.rental ? (
              !isMine && (
                <>
                  <button onClick={() => setShowBooking(true)}
                    className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-emerald-500 text-black font-semibold text-[15px] active:scale-[0.99]">
                    <CalendarCheck className="w-5 h-5" /> Réserver{annonce.price_label ? ` · ${annonce.price_label}/${annonce.category === 'Immobilier' ? 'nuit' : 'j'}` : ''}
                  </button>
                  <p className="text-white/45 text-[11px] text-center w-full">Choisis tes dates sur le calendrier de disponibilité.</p>
                </>
              )
            ) : annonce.category === 'Immobilier' ? (
              /* IMMOBILIER (vente) : on ne vend PAS le bien dans l'app (notaire). Acompte de
                 réservation seulement, si le vendeur l'a activé. */
              !isMine && (annonce.reserved ? (
                <div className="w-full text-center py-3 rounded-2xl bg-white/[0.06] border border-white/10 text-white/70 text-[14px] font-medium inline-flex items-center justify-center gap-2"><Lock className="w-4 h-4" /> Déjà réservé</div>
              ) : annonce.deposit_cents ? (
                <>
                  <button onClick={() => doReserve()} disabled={busy}
                    className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-emerald-500 text-black font-semibold text-[15px] disabled:opacity-50 active:scale-[0.99]">
                    {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <CalendarCheck className="w-5 h-5" />}
                    Verser l’acompte · {formatMoney(annonce.deposit_cents)}
                  </button>
                  <p className="text-white/45 text-[11px] text-center w-full">Réserve le bien 14 j (acompte sécurisé). La vente se finalise hors plateforme.</p>
                </>
              ) : null)
            ) : annonce.price_label && (
              <>
                <button onClick={() => acheter()} disabled={busy}
                  className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-emerald-500 text-black font-semibold text-[15px] disabled:opacity-50 active:scale-[0.99]">
                  {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <ShoppingBag className="w-5 h-5" />}
                  Acheter {annonce.price_label}
                </button>
                <p className="text-white/45 text-[11px] text-center inline-flex items-center justify-center gap-1 w-full"><Lock className="w-3 h-3" /> Paiement protégé : bloqué jusqu’à réception, puis libéré au vendeur.</p>
              </>
            )}
            {isMine ? (
              /* Ma propre annonce → Modifier + Mettre en avant (premium). */
              <>
                {onEdit && (
                  <button onClick={() => { onEdit(); onClose(); }}
                    className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-white text-black font-semibold text-[15px] active:scale-[0.99]">
                    <Pencil className="w-5 h-5" /> Modifier mon annonce
                  </button>
                )}
                {!boostPick ? (
                  <button onClick={() => setBoostPick(true)}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-amber-500/15 text-amber-200 border border-amber-400/30 font-semibold text-[14px] active:scale-[0.99]">
                    ✨ Mettre en avant (en vedette)
                  </button>
                ) : (
                  <div className="rounded-2xl border border-amber-400/30 bg-amber-500/[0.06] p-3 space-y-2">
                    <p className="text-[12.5px] text-amber-100/90 font-medium">Mise en avant — l’annonce remonte en tête du feed avec un badge ✨</p>
                    {BOOST_OPTIONS.map((o) => (
                      <button key={o.key} onClick={() => doBoost(o.key)} disabled={boosting}
                        className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl bg-white/[0.06] border border-white/10 text-white text-[13.5px] font-medium disabled:opacity-50 active:scale-[0.99]">
                        <span>{o.label}</span><span className="text-amber-200 font-bold">{formatMoney(o.ar)}</span>
                      </button>
                    ))}
                    <button onClick={() => setBoostPick(false)} className="w-full py-1.5 text-white/50 text-[12px]">Annuler</button>
                  </div>
                )}
              </>
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

      {/* Step-up : validation mobile avant la page de paiement (achat depuis un PC). */}
      {payAuthId && <MobilePayAuthModal authId={payAuthId} onApproved={(id) => { setPayAuthId(null); if (boostPending) { const p = boostPending; setBoostPending(null); doBoost(p, id); } else if (reservePending) { setReservePending(false); doReserve(id); } else acheter(id); }} onClose={() => setPayAuthId(null)} />}

      {/* Réservation (location) : calendrier de dispo ouvert directement sur ce véhicule. */}
      {showBooking && (
        <RentalSheet
          vehicleId={annonce.id}
          propertyMode={annonce.category === 'Immobilier'}
          directItem={{ id: annonce.id, title: annonce.title, description: annonce.description, price_label: annonce.price_label, city: annonce.city, image_url: annonce.media_url, driver_option: annonce.driver_option ?? null, seller: null }}
          onClose={() => setShowBooking(false)}
        />
      )}

      {/* Paiement PaPi DANS l'app (modal iframe, pas de navigateur externe). */}
      {payUrl && <PaymentFrame url={payUrl} onClose={closePay} />}
    </div>
  );
}
