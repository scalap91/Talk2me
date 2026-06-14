'use client';

/**
 * Talk2Me — Fiche boutique/resto plein écran (catalogue + commande). Partagé par
 * Annonces et Eat. Pour un resto (kind='eat') : panier + Commander → escrow.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Store, ChevronLeft, MessageCircle } from 'lucide-react';
import DeliveryTracking from './DeliveryTracking';

export default function BoutiqueSheet({ shopKey, onClose }: { shopKey: string; onClose: () => void }) {
  const router = useRouter();
  const [me, setMe] = useState<string | null>(null);
  const [contacting, setContacting] = useState(false);
  const [shop, setShop] = useState<{ name: string; description: string | null; kind?: string; owner_id?: string } | null>(null);
  const [items, setItems] = useState<{ id: string; image_url: string; label: string | null; price_cents: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [ordering, setOrdering] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [trackEscrow, setTrackEscrow] = useState<string | null>(null); // suivi livraison ouvert
  const [driveMode, setDriveMode] = useState(false); // l'user est chauffeur EN LIGNE → récupère lui-même

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

  const eur = (c: number) => (c / 100).toLocaleString('fr-FR', { minimumFractionDigits: c % 100 ? 2 : 0 }) + ' €';
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

  return (
    <div className="fixed inset-0 z-[70] bg-[#0e0e12] flex flex-col">
      <header className="shrink-0 flex items-center gap-2 px-3 border-b border-white/8" style={{ height: 'calc(env(safe-area-inset-top) + 3.25rem)', paddingTop: 'env(safe-area-inset-top)' }}>
        <button onClick={onClose} aria-label="Retour" className="w-9 h-9 rounded-full grid place-items-center text-white/80"><ChevronLeft className="w-6 h-6" /></button>
        <Store className="w-5 h-5 text-red-300" />
        <h1 className="text-[16px] font-semibold text-white/95 truncate">{shop?.name || 'Boutique'}</h1>
      </header>
      <div className="flex-1 min-h-0 overflow-y-auto p-3" style={{ paddingBottom: (isEat && cartCount > 0) || (!isEat && !isMine) ? '6rem' : undefined }}>
        {shop?.description && <p className="text-[13px] text-white/65 mb-3 px-1">{shop.description}</p>}
        {/* L'appli reconnaît que tu es en mode Drive → tu récupères toi-même */}
        {isEat && driveMode && (
          <div className="mb-3 rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-100">
            🛺 <b>Mode Drive détecté</b> — pas besoin de livraison, tu es déjà sur la route. Tu <b>récupères ta commande toi-même</b>, prête à ton arrivée.
          </div>
        )}
        {isEat && !driveMode && <p className="text-[12px] text-amber-300/90 mb-2 px-1">🍔 Ajoute des plats au panier, puis commande.</p>}
        {loading ? (
          <div className="flex justify-center py-10 text-white/40"><Loader2 className="w-5 h-5 animate-spin" /></div>
        ) : items.length === 0 ? (
          <p className="text-center text-white/40 text-[13px] py-10">{isEat ? 'Carte vide.' : 'Aucun article.'}</p>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {items.map((it) => (
              <div key={it.id} className="rounded-2xl overflow-hidden border border-white/10 bg-white/[0.03]">
                <div className="relative w-full aspect-square">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={it.image_url} alt={it.label || ''} className="w-full h-full object-cover" />
                  <span className="absolute bottom-2 left-2 text-[14px] font-bold px-2 py-0.5 rounded-lg bg-black/65 text-white">{eur(it.price_cents)}</span>
                  {isEat && (
                    cart[it.id] ? (
                      <div className="absolute bottom-2 right-2 flex items-center gap-1.5 bg-black/70 rounded-full px-1 py-0.5">
                        <button onClick={() => removeFromCart(it.id)} className="w-6 h-6 rounded-full bg-white/15 text-white grid place-items-center text-[15px] leading-none">−</button>
                        <span className="text-[13px] font-bold text-white w-4 text-center">{cart[it.id]}</span>
                        <button onClick={() => addToCart(it.id)} className="w-6 h-6 rounded-full bg-amber-500 text-white grid place-items-center text-[15px] leading-none">+</button>
                      </div>
                    ) : (
                      <button onClick={() => addToCart(it.id)} className="absolute bottom-2 right-2 w-7 h-7 rounded-full bg-amber-500 text-white grid place-items-center text-[18px] leading-none shadow">+</button>
                    )
                  )}
                </div>
                {it.label && <p className="text-[11px] text-white/70 line-clamp-1 px-2 py-1.5">{it.label}</p>}
              </div>
            ))}
          </div>
        )}
        {msg && <p className="text-center text-[13px] text-white/80 mt-4 px-4">{msg}</p>}
      </div>

      {isEat && cartCount > 0 && (
        <div className="absolute bottom-0 inset-x-0 z-10 px-3 pt-2 pb-4 bg-gradient-to-t from-black/90 to-transparent">
          <button onClick={order} disabled={ordering}
            className="w-full flex items-center justify-between px-4 py-3 rounded-2xl bg-amber-500 text-black font-bold text-[14px] disabled:opacity-60 active:scale-[0.99]">
            <span>{ordering ? 'Commande…' : `${driveMode ? 'Commander à récupérer' : 'Commander'} · ${cartCount} plat${cartCount > 1 ? 's' : ''}`}</span>
            <span>{eur(cartTotal)}</span>
          </button>
        </div>
      )}

      {/* Boutique (non-resto) : contacter le vendeur (masqué si c'est ma boutique) */}
      {!isEat && !isMine && !loading && (
        <div className="absolute bottom-0 inset-x-0 z-10 px-3 pt-2 pb-[calc(env(safe-area-inset-bottom)+0.9rem)] bg-gradient-to-t from-[#0e0e12] via-[#0e0e12]/95 to-transparent">
          <button onClick={contactSeller} disabled={contacting}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-red-600 text-white font-semibold text-[15px] disabled:opacity-60 active:scale-[0.99]">
            {contacting ? <Loader2 className="w-5 h-5 animate-spin" /> : <MessageCircle className="w-5 h-5" />}
            {contacting ? 'Ouverture du chat…' : 'Contacter le vendeur'}
          </button>
        </div>
      )}

      {/* Après commande : suivi scooter (livraison) OU « récupère toi-même » (mode Drive) */}
      {trackEscrow && (
        <DeliveryTracking escrowId={trackEscrow} restoName={shop?.name || 'Resto'} pickup={driveMode} onClose={() => { setTrackEscrow(null); onClose(); }} />
      )}
    </div>
  );
}
