'use client';
/**
 * CheckoutSheet — feuille de COMMANDE unique (Retrait / Livraison), IDENTIQUE web + natif.
 * Un seul écran : panier → toggle Retrait/Livraison → (pin GPS+repère+tél | agence) → récap → Payer.
 * Paiement = rail unique /api/commerce/buy → escrow RÉEL (Phase 2). Mada-first : pas d'adresse rue.
 * Le natif (Flutter) reproduit ces MÊMES étapes/blocs (parcours identique).
 */
import { useEffect, useState, useCallback } from 'react';
import { MapPin, Lock, Loader2 } from '@/lib/icons';
import { getPosition } from '@/lib/client/geo';
import { payForCard } from '@/lib/client/pay-for-card';
import PaymentFrame from '@/components/pay/PaymentFrame';

type Item = { id: string; label: string | null; price_cents: number; image_url?: string | null };
type Agency = { id: string; name: string; detail: string; kind: 'shop' | 'carrier' };

function ar(cents: number): string {
  return `${Math.round(cents).toLocaleString('fr')} Ar`;
}

export default function CheckoutSheet({ shop, items, cart, onClose, onPaid }: {
  shop: { id?: string; name: string; public_key?: string | null; kind?: string };
  items: Item[];
  cart: Record<string, number>;
  onClose: () => void;
  onPaid: (msg: string) => void;
}) {
  const lines = items.filter((it) => (cart[it.id] || 0) > 0).map((it) => ({ ...it, qty: cart[it.id] }));
  const articles = lines.reduce((s, l) => s + l.price_cents * l.qty, 0);

  const [mode, setMode] = useState<'retrait' | 'livraison'>('livraison');
  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [landmark, setLandmark] = useState('');
  const [phone, setPhone] = useState('');
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [agencyId, setAgencyId] = useState<string>('');
  const [delivery, setDelivery] = useState(0);
  const [quoting, setQuoting] = useState(false);
  const [paying, setPaying] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [payUrl, setPayUrl] = useState<string | null>(null);
  const [payIntent, setPayIntent] = useState<string | null>(null);

  // 5b (Pascal 2026-08-06) : préremplir la livraison depuis l'adresse ENREGISTRÉE (GPS + repère + tél).
  // On ne resaisit pas ce qu'on a déjà donné. Modifiable : « réajuster » recapture le GPS.
  const [prefilled, setPrefilled] = useState(false);
  useEffect(() => {
    fetch('/api/shop/address', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const a = d?.address; if (!a) return;
        if (a.lat != null && a.lng != null) { setPos({ lat: a.lat, lng: a.lng }); setPrefilled(true); }
        if (a.landmark) setLandmark((v) => v || a.landmark);
        if (a.phone) setPhone((v) => v || a.phone);
      })
      .catch(() => {});
  }, []);

  // Agences de RETRAIT (dépôt boutique + dépôts transporteurs proches).
  useEffect(() => {
    const sid = shop.id || '';
    fetch(`/api/simple-shop/${encodeURIComponent(sid)}/pickup-agencies`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.agencies?.length) { setAgencies(d.agencies); setAgencyId(d.agencies[0].id); } })
      .catch(() => {});
  }, [shop.id]);

  // LIVRAISON : géoloc → devis LIVE des frais (via /api/commerce/quote).
  const locate = useCallback(async () => {
    setLocating(true);
    const p = await getPosition().catch(() => null);
    setLocating(false);
    if (!p) { setMsg('Active ta position pour la livraison, ou choisis Retrait.'); return; }
    setPos({ lat: p.lat, lng: p.lng });
  }, []);

  useEffect(() => {
    if (mode !== 'livraison' || !pos) { if (mode === 'retrait') setDelivery(0); return; }
    setQuoting(true);
    fetch('/api/commerce/quote', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: shop.kind === 'eat' ? 'plat' : 'boutique', shop_id: shop.id, shop_key: shop.public_key, items: lines.map((l) => ({ item_id: l.id, qty: l.qty })), lat: pos.lat, lng: pos.lng }),
    }).then((r) => r.json()).then((d) => { if (d?.ok && d.quote) setDelivery(d.quote.delivery || 0); })
      .catch(() => {}).finally(() => setQuoting(false));
  }, [mode, pos]); // eslint-disable-line react-hooks/exhaustive-deps

  const total = articles + (mode === 'livraison' ? delivery : 0);

  const pay = async (authId?: string, msisdn?: string) => {
    if (paying) return;
    if (mode === 'livraison' && !pos) { setMsg('Indique où livrer (ta position).'); return; }
    if (mode === 'retrait' && agencies.length && !agencyId) { setMsg('Choisis un point de retrait.'); return; }
    setPaying(true); setMsg(null);
    try {
      const rep = { id: lines[0]?.id || '', channel: (shop.kind === 'eat' ? 'eat' : 'boutique') as 'eat' | 'boutique' };
      const d = await payForCard(rep, shop.kind === 'eat' ? 'order' : 'buy', {
        shopKey: shop.public_key || undefined, shopId: shop.id || undefined,
        items: lines.map((l) => ({ item_id: l.id, qty: l.qty })),
        lat: mode === 'livraison' ? pos?.lat : undefined, lng: mode === 'livraison' ? pos?.lng : undefined,
        serviceMode: mode, landmark: mode === 'livraison' ? landmark : undefined,
        phone: mode === 'livraison' ? phone : undefined, agencyId: mode === 'retrait' ? agencyId : undefined,
        forceExternal: true, payAuthId: authId, msisdn,
      });
      if (!d.ok && d.error === 'msisdn_required') { const m = window.prompt('Ton numéro Mobile Money :') || ''; if (m.length >= 6) return pay(undefined, m); setPaying(false); return; }
      if (!d.ok && !d.checkoutUrl) { setMsg('Paiement indisponible, réessaie.'); setPaying(false); return; }
      if (d.mode === 'paid') { onPaid(mode === 'retrait' && d.pickupCode ? `✅ Payé — RETRAIT. Ton code : ${d.pickupCode} (à montrer au point de retrait)` : '✅ Payé — paiement protégé (escrow)'); return; }
      if (d.checkoutUrl) { setPayIntent(d.intentId || null); setPayUrl(d.checkoutUrl); return; }
      onPaid('📲 Paiement lancé — confirme sur ton téléphone.');
    } catch { setMsg('Erreur réseau.'); setPaying(false); }
  };

  const closePay = async () => {
    const intent = payIntent; setPayUrl(null); setPayIntent(null); setPaying(false);
    if (!intent) return;
    try {
      const s = await fetch(`/api/wallet/topup/status?intent=${encodeURIComponent(intent)}`, { cache: 'no-store' }).then((r) => r.json());
      if (s?.status === 'paid') onPaid(mode === 'retrait' ? '✅ Paiement confirmé — RETRAIT. Ton code de retrait est dans Suivi de commande.' : '✅ Paiement confirmé — achat protégé.');
    } catch { /* */ }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 90, background: 'rgba(20,20,26,.45)', display: 'flex', alignItems: 'flex-end' }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxHeight: '92vh', overflowY: 'auto', background: '#fff', borderRadius: '22px 22px 0 0', padding: '12px 16px calc(env(safe-area-inset-bottom) + 18px)' }}>
        <div style={{ width: 40, height: 4, background: '#d7dbe0', borderRadius: 3, margin: '2px auto 14px' }} />
        <h3 style={{ fontFamily: "'Outfit',sans-serif", fontWeight: 800, fontSize: 18, color: '#1A1D22', margin: '0 0 12px' }}>Ta commande</h3>

        {/* Panier */}
        {lines.map((l) => (
          <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '6px 0' }}>
            <div style={{ width: 44, height: 44, borderRadius: 9, background: l.image_url ? `center/cover url(${l.image_url})` : 'linear-gradient(135deg,#ffd9a8,#ff9a3d)', flex: '0 0 auto' }} />
            <div style={{ flex: 1 }}><div style={{ fontWeight: 700, color: '#1A1D22' }}>{l.label || 'Article'}</div><div style={{ fontSize: 12, color: '#6A7585' }}>×{l.qty}</div></div>
            <div style={{ fontWeight: 700 }}>{ar(l.price_cents * l.qty)}</div>
          </div>
        ))}
        <div style={{ height: 1, background: '#EEF0F2', margin: '10px 0' }} />

        {/* Toggle Retrait / Livraison */}
        <div style={{ display: 'flex', gap: 8, margin: '2px 0 12px' }}>
          {([['retrait', 'Retrait'], ['livraison', 'Livraison']] as const).map(([m, lbl]) => {
            const on = mode === m;
            return (
              <button key={m} onClick={() => setMode(m)} style={{ flex: 1, border: `1.5px solid ${on ? '#FF7F11' : '#EEF0F2'}`, background: on ? 'rgba(255,127,17,.08)' : '#fff', color: on ? '#FF7F11' : '#6A7585', borderRadius: 12, padding: 12, fontWeight: 700, fontSize: 14, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, cursor: 'pointer' }}>
                <span style={{ fontSize: 19 }}>{m === 'retrait' ? '🏪' : '🛵'}</span>{lbl}
              </button>
            );
          })}
        </div>

        {/* Bloc conditionnel */}
        {mode === 'livraison' ? (
          <div style={{ background: '#fafbfc', border: '1px solid #EEF0F2', borderRadius: 12, padding: 12, marginBottom: 12 }}>
            <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.5px', color: '#6A7585', marginBottom: 6, fontWeight: 700 }}>Où livrer ?</div>
            {prefilled && <div style={{ fontSize: 11.5, color: '#0E9F6E', marginBottom: 8, fontWeight: 600 }}>📍 Adresse enregistrée préremplie — modifie si besoin.</div>}
            <button onClick={locate} style={{ width: '100%', border: `1px solid ${pos ? '#FF7F11' : '#EEF0F2'}`, background: pos ? 'rgba(255,127,17,.06)' : '#fff', borderRadius: 9, padding: '11px 12px', fontSize: 13.5, color: pos ? '#1A1D22' : '#aab2bd', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', textAlign: 'left' }}>
              {locating ? <Loader2 className="w-4 h-4 animate-spin" /> : <MapPin className="w-4 h-4" style={{ color: '#FF7F11' }} />}
              {pos ? 'Position enregistrée ✓ (appuie pour réajuster)' : 'Utiliser ma position actuelle'}
            </button>
            <input value={landmark} onChange={(e) => setLandmark(e.target.value)} placeholder="Point de repère (ex : à côté de l'épicerie)" style={inp} />
            <input value={phone} onChange={(e) => setPhone(e.target.value.replace(/[^\d+ ]/g, ''))} inputMode="tel" placeholder="Ton numéro (le livreur t'appelle)" style={{ ...inp, marginBottom: 0 }} />
          </div>
        ) : (
          <div style={{ background: '#fafbfc', border: '1px solid #EEF0F2', borderRadius: 12, padding: 12, marginBottom: 12 }}>
            <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.5px', color: '#6A7585', marginBottom: 6, fontWeight: 700 }}>Où récupérer ?</div>
            {agencies.length === 0 && <div style={{ fontSize: 13, color: '#6A7585', padding: '4px 2px' }}>Point de retrait chez le vendeur (à confirmer par message).</div>}
            {agencies.map((a) => {
              const sel = agencyId === a.id;
              return (
                <button key={a.id} onClick={() => setAgencyId(a.id)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: 10, border: `1px solid ${sel ? '#FF7F11' : '#EEF0F2'}`, borderRadius: 9, background: sel ? 'rgba(255,127,17,.05)' : '#fff', marginBottom: 8, cursor: 'pointer', textAlign: 'left' }}>
                  <span style={{ width: 34, height: 34, borderRadius: 8, background: 'rgba(255,127,17,.12)', color: '#FF7F11', display: 'grid', placeItems: 'center', fontSize: 16, flex: '0 0 auto' }}>{a.kind === 'shop' ? '🏪' : '📦'}</span>
                  <span style={{ flex: 1 }}><span style={{ fontWeight: 700, fontSize: 13.5, color: '#1A1D22', display: 'block' }}>{a.name}</span><span style={{ fontSize: 11.5, color: '#6A7585' }}>{a.detail}</span></span>
                  {sel && <span style={{ color: '#FF7F11' }}>✓</span>}
                </button>
              );
            })}
          </div>
        )}

        <div style={{ height: 1, background: '#EEF0F2', margin: '10px 0' }} />

        {/* Récap */}
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', fontSize: 14 }}><span style={{ color: '#6A7585' }}>Articles</span><span>{ar(articles)}</span></div>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', fontSize: 14 }}>
          <span style={{ color: '#6A7585' }}>{mode === 'livraison' ? 'Livraison' : 'Retrait'}</span>
          {mode === 'livraison' ? <span>{quoting ? '…' : pos ? ar(delivery) : '— (indique où)'}</span> : <span style={{ color: '#5fbf7d', fontWeight: 700 }}>Gratuit</span>}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: "'Outfit'", fontWeight: 800, fontSize: 17, color: '#1A1D22', padding: '6px 0 12px' }}><span>Total</span><span>{ar(total)}</span></div>

        {msg && <p style={{ color: '#c98a8a', fontSize: 13, textAlign: 'center', margin: '0 0 8px' }}>{msg}</p>}

        <button onClick={() => pay()} disabled={paying} style={{ width: '100%', background: '#FF7F11', color: '#fff', border: 'none', borderRadius: 16, padding: 15, fontFamily: "'Outfit'", fontWeight: 800, fontSize: 15, boxShadow: '0 8px 20px rgba(255,127,17,.35)', opacity: paying ? 0.6 : 1, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          {paying ? <Loader2 className="w-5 h-5 animate-spin" /> : <Lock className="w-4 h-4" />}
          {paying ? 'Paiement…' : `Payer · ${ar(total)} · protégé`}
        </button>
        <p style={{ color: '#9DAAB7', fontSize: 11, textAlign: 'center', marginTop: 8 }}>🔒 Paiement protégé jusqu'à la réception.</p>
      </div>

      {payUrl && <PaymentFrame url={payUrl} onClose={closePay} />}
    </div>
  );
}

const inp: React.CSSProperties = { width: '100%', background: '#fff', border: '1px solid #EEF0F2', borderRadius: 9, padding: '11px 12px', fontSize: 13.5, color: '#1A1D22', marginBottom: 8, outline: 'none', boxSizing: 'border-box' };
