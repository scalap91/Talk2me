'use client';
/**
 * /shop/panier — MON PANIER UNIVERSEL : un panier PAR vendeur (boutique / Eat / SHEIN / import…),
 * persistés (cart-store, localStorage). Plusieurs paniers en même temps (marketplace multi-vendeurs).
 * « Reprendre » rouvre la boutique → son panier est déjà rempli. Chaque vendeur = paiement + livraison
 * séparés. Accès depuis le profil. Mada-first : rien ne se perd entre 2 sessions.
 */
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import BackButton from '@/components/system/BackButton';
import { listCarts, clearCart, type CartMeta } from '@/lib/client/cart-store';

export default function ShopPanierPage() {
  const router = useRouter();
  const [carts, setCarts] = useState<CartMeta[]>([]);
  const refresh = () => setCarts(listCarts());
  useEffect(() => {
    refresh();
    const on = () => refresh();
    window.addEventListener('t2m:carts:changed', on);
    return () => window.removeEventListener('t2m:carts:changed', on);
  }, []);

  const totalArticles = carts.reduce((s, c) => s + c.count, 0);
  const open = (c: CartMeta) => router.push(`/b/${c.shopKey || c.shopId}`);

  return (
    <div style={{ minHeight: '100vh', background: '#F5F6F8' }}>
      <div style={{ position: 'sticky', top: 0, zIndex: 5, display: 'flex', alignItems: 'center', gap: 8, background: '#fff', borderBottom: '1px solid #EEF0F2', padding: 'calc(env(safe-area-inset-top) + 10px) 12px 10px' }}>
        <BackButton size={24} className="w-10 h-10 rounded-full grid place-items-center text-[#2F343A] hover:text-black transition-colors" />
        <div style={{ fontFamily: "'Outfit',sans-serif", fontWeight: 800, fontSize: 18, color: '#1A1D22' }}>Mon panier{totalArticles > 0 ? ` · ${totalArticles}` : ''}</div>
      </div>

      <div style={{ padding: 14, maxWidth: 640, margin: '0 auto' }}>
        {carts.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#6A7585', padding: '60px 20px' }}>
            <div style={{ fontSize: 40, marginBottom: 10 }}>🛒</div>
            <div style={{ fontWeight: 700, color: '#1A1D22' }}>Ton panier est vide</div>
          </div>
        ) : (
          <>
            {carts.map((c) => (
              <div key={c.shopId} style={{ background: '#fff', border: '1px solid #EEF0F2', borderRadius: 14, padding: 14, marginBottom: 12, boxShadow: '0 2px 10px rgba(47,52,58,.04)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                  <div style={{ width: 44, height: 44, borderRadius: 11, background: 'linear-gradient(135deg,#FFD9A8,#FF9A3D)', display: 'grid', placeItems: 'center', color: '#fff', fontFamily: "'Outfit',sans-serif", fontWeight: 700, fontSize: 20, flex: '0 0 auto' }}>{(c.shopName || 'B')[0]?.toUpperCase()}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, color: '#1A1D22', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.shopName || 'Boutique'}</div>
                    <div style={{ fontSize: 12.5, color: '#6A7585' }}>{c.count} article{c.count > 1 ? 's' : ''} · {c.kind === 'eat' || c.kind === 'plat_maison' ? 'à commander' : 'en attente de paiement'}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  <button onClick={() => open(c)} style={{ flex: 1, height: 42, borderRadius: 12, border: 'none', background: '#FF7F11', color: '#fff', fontFamily: "'Outfit',sans-serif", fontWeight: 800, fontSize: 14, cursor: 'pointer' }}>Reprendre la commande</button>
                  <button onClick={() => { clearCart(c.shopId); refresh(); }} aria-label="Vider ce panier" style={{ width: 42, height: 42, borderRadius: 12, border: '1px solid #EEF0F2', background: '#fff', color: '#c98a8a', fontSize: 17, cursor: 'pointer' }}>🗑</button>
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
