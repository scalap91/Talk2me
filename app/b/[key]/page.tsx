'use client';

/**
 * Talk2Me — Vue PUBLIQUE d'une petite boutique (lien partagé /b/<clé> ou depuis
 * une story). Acheteur : voit photos + prix + description, peut CONTACTER le
 * vendeur. Bouton retour toujours présent (Pascal 2026-06-11 : on était coincé).
 */

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ChevronLeft, MessageCircle, Loader2 } from '@/lib/icons';

interface Item { id: string; image_url: string; label: string | null; price_cents: number }

export default function PublicShopPage() {
  const { key } = useParams<{ key: string }>();
  const router = useRouter();
  const [name, setName] = useState('');
  const [desc, setDesc] = useState<string | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [isMine, setIsMine] = useState(false);
  const [loading, setLoading] = useState(true);
  const [contacting, setContacting] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      let me: string | null = null;
      try { const r = await fetch('/api/auth/me', { cache: 'no-store' }); if (r.ok) me = (await r.json())?.user?.id || null; } catch {}
      try {
        const r = await fetch(`/api/simple-shop/by-key?key=${encodeURIComponent(String(key))}`, { cache: 'no-store' });
        const d = r.ok ? await r.json() : null;
        if (alive && d?.ok) {
          setName(d.shop.name); setDesc(d.shop.description || null); setItems(d.items || []);
          if (me && d.shop.owner_id && me === d.shop.owner_id) setIsMine(true);
        }
      } catch {}
      if (alive) setLoading(false);
    })();
    return () => { alive = false; };
  }, [key]);

  const eur = (c: number) => (c / 100).toLocaleString('fr-FR', { minimumFractionDigits: c % 100 ? 2 : 0 }) + ' €';

  const goBack = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) router.back();
    else router.push('/home');
  };

  const contact = async () => {
    if (contacting) return;
    setContacting(true);
    try {
      const r = await fetch('/api/simple-shop/contact', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key }),
      });
      const d = await r.json();
      if (r.ok && d.conversationId) router.push(`/c/${d.conversationId}`);
      else setContacting(false);
    } catch { setContacting(false); }
  };

  return (
    <div className="min-h-[100svh] bg-[#F5F6F8] text-[#2F343A]">
      {/* POSE Gemini — cover mangue + carte enseigne */}
      <div style={{ position: 'relative' }}>
        <div style={{ height: 170, background: 'linear-gradient(135deg,#FF7F11 0%,#FFB05C 100%)' }} />
        <button onClick={goBack} aria-label="Retour" style={{ position: 'absolute', top: 'calc(env(safe-area-inset-top) + 12px)', left: 12, width: 36, height: 36, borderRadius: '50%', background: 'rgba(255,255,255,.92)', display: 'grid', placeItems: 'center', border: 'none' }}><ChevronLeft className="w-6 h-6 text-[#2F343A]" /></button>
        <div style={{ background: '#FFFFFF', borderRadius: 18, boxShadow: '0 4px 16px rgba(47,52,58,.06)', padding: 20, margin: '-56px 20px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
          <div style={{ width: 80, height: 80, borderRadius: '50%', background: 'linear-gradient(135deg,#FFD9A8,#FF9A3D)', border: '4px solid #fff', marginTop: -56, marginBottom: 10, display: 'grid', placeItems: 'center', color: '#fff', fontFamily: "'Outfit',sans-serif", fontWeight: 700, fontSize: 32 }}>{(name || 'B')[0]?.toUpperCase()}</div>
          <div style={{ fontFamily: "'Outfit',sans-serif", fontWeight: 700, fontSize: 22 }}>{name || 'Boutique'}</div>
          {desc && <div style={{ fontSize: 14, color: '#6A7585', marginTop: 4 }}>{desc}</div>}
        </div>
      </div>

      <h2 style={{ fontFamily: "'Outfit',sans-serif", fontWeight: 600, fontSize: 18, margin: '18px 20px 10px' }}>Ses articles</h2>

      {loading ? (
        <p className="text-center text-[#9DAAB7] py-10 text-[13px]">Chargement…</p>
      ) : items.length === 0 ? (
        <p className="text-center text-[#9DAAB7] py-10 text-[13px]">Boutique vide pour le moment.</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 px-5 pb-28">
          {items.map((it) => (
            <button key={it.id} onClick={isMine ? undefined : contact} className="rounded-[18px] overflow-hidden bg-white text-left active:scale-[0.99]" style={{ boxShadow: '0 4px 16px rgba(47,52,58,.06)' }}>
              <div className="relative w-full aspect-square bg-[#eef1f5]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={it.image_url} alt={it.label || ''} className="w-full h-full object-cover" />
              </div>
              <div className="px-3 pt-2 pb-3">
                {it.label && <p className="text-[13.5px] font-semibold text-[#2F343A] line-clamp-1">{it.label}</p>}
                <p className="text-[15px] font-bold text-[#FF7F11] mt-0.5" style={{ fontFamily: "'Outfit',sans-serif" }}>{eur(it.price_cents)}</p>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Contacter le vendeur — barre fixe en bas (masquée si c'est ma boutique) */}
      {!isMine && !loading && (
        <div className="fixed bottom-0 inset-x-0 z-20 px-3 pt-2 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]" style={{ background: 'linear-gradient(to top,#F5F6F8,rgba(245,246,248,.95),transparent)' }}>
          <button onClick={contact} disabled={contacting}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl text-white text-[15px] font-semibold disabled:opacity-50 active:scale-[0.99]" style={{ background: '#FF7F11', boxShadow: '0 8px 20px rgba(255,127,17,.35)' }}>
            {contacting ? <Loader2 className="w-5 h-5 animate-spin" /> : <MessageCircle className="w-5 h-5" />}
            {contacting ? 'Ouverture du chat…' : 'Contacter le vendeur'}
          </button>
        </div>
      )}
    </div>
  );
}
