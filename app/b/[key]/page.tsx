'use client';

/**
 * Talk2Me — Vue PUBLIQUE d'une petite boutique (lien partagé /b/<clé> ou depuis
 * une story). Acheteur : voit photos + prix + description, peut CONTACTER le
 * vendeur. Bouton retour toujours présent (Pascal 2026-06-11 : on était coincé).
 */

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ChevronLeft, MessageCircle, Loader2 } from 'lucide-react';

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
        const r = await fetch(`/api/simple-shop/x?key=${key}`, { cache: 'no-store' });
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
    <div className="min-h-[100dvh] bg-[#0e0e12] text-white">
      <header className="sticky top-0 z-10 px-2 h-14 flex items-center gap-1.5 border-b border-white/8 bg-[#0e0e12]/90 backdrop-blur-xl">
        <button onClick={goBack} aria-label="Retour" className="w-9 h-9 rounded-full grid place-items-center text-white/85 hover:text-white shrink-0">
          <ChevronLeft className="w-6 h-6" />
        </button>
        <h1 className="text-[16px] font-semibold truncate">{name || 'Boutique'}</h1>
      </header>

      {desc && <p className="px-4 py-2.5 text-[13px] text-white/65 leading-relaxed border-b border-white/8">{desc}</p>}

      {loading ? (
        <p className="text-center text-white/40 py-16 text-[13px]">Chargement…</p>
      ) : items.length === 0 ? (
        <p className="text-center text-white/40 py-16 text-[13px]">Boutique vide pour le moment.</p>
      ) : (
        <div className="grid grid-cols-2 gap-2 p-3 pb-28">
          {items.map((it) => (
            <button key={it.id} onClick={isMine ? undefined : contact} className="rounded-2xl overflow-hidden border border-white/10 bg-white/[0.03] text-left active:scale-[0.99]">
              <div className="relative w-full aspect-square">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={it.image_url} alt={it.label || ''} className="w-full h-full object-cover" />
                <span className="absolute bottom-2 left-2 text-[14px] font-bold px-2 py-0.5 rounded-lg bg-black/65">{eur(it.price_cents)}</span>
              </div>
              {it.label && <p className="text-[12px] text-white/85 px-2.5 py-1.5 line-clamp-1">{it.label}</p>}
            </button>
          ))}
        </div>
      )}

      {/* Contacter le vendeur — barre fixe en bas (masquée si c'est ma boutique) */}
      {!isMine && !loading && (
        <div className="fixed bottom-0 inset-x-0 z-20 px-3 pt-2 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] bg-gradient-to-t from-[#0e0e12] via-[#0e0e12]/95 to-transparent">
          <button onClick={contact} disabled={contacting}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-red-600 text-white text-[15px] font-semibold disabled:opacity-50 active:scale-[0.99]">
            {contacting ? <Loader2 className="w-5 h-5 animate-spin" /> : <MessageCircle className="w-5 h-5" />}
            {contacting ? 'Ouverture du chat…' : 'Contacter le vendeur'}
          </button>
        </div>
      )}
    </div>
  );
}
