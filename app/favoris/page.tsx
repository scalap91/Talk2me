'use client';

/**
 * /favoris — Mes fiches en FAVORI (Pascal 2026-08-30). Consomme GET /api/simple-shop/favorites
 * (aucune UI ne le faisait). Tous kinds (boutique/eat/plat/service/emploi/rencontre). Tap → la fiche
 * publique /b/<key>. C'est aussi là qu'atterrit une fiche reçue par invitation (/i/<key>).
 */
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Heart } from '@/lib/icons';

interface Fav { id: string; name: string; kind?: string | null; public_key?: string | null; cover_url?: string | null; items_count?: number; address?: string | null }

const KIND_LABEL: Record<string, string> = { boutique: 'Boutique', eat: 'Restaurant', plat_maison: 'Cuisine maison', service: 'Service', emploi: 'Emploi', rencontre: 'Profil' };

export default function FavorisPage() {
  const router = useRouter();
  const [shops, setShops] = useState<Fav[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/simple-shop/favorites', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.shops) setShops(d.shops); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-[100svh] bg-white">
      <header className="sticky top-0 z-10 flex items-center gap-2 px-3 h-14 bg-white border-b border-[#EDF0F4]">
        <button type="button" onClick={() => router.back()} aria-label="Retour" className="w-9 h-9 grid place-items-center rounded-full text-[#2F343A] active:scale-95"><ArrowLeft className="w-5 h-5" /></button>
        <h1 className="text-[17px] font-extrabold text-[#2F343A]" style={{ fontFamily: "'Outfit',sans-serif" }}>Favoris</h1>
      </header>

      <div className="px-4 pt-3 pb-24">
        {loading ? (
          <p className="text-center text-[#9DAAB7] text-[13px] mt-10">Chargement…</p>
        ) : shops.length === 0 ? (
          <div className="text-center mt-16 px-6">
            <div className="w-16 h-16 rounded-full bg-[#F5F6F8] grid place-items-center mx-auto mb-3"><Heart className="w-6 h-6 text-[#9DAAB7]" /></div>
            <p className="text-[15px] font-bold text-[#2F343A]" style={{ fontFamily: "'Outfit',sans-serif" }}>Aucun favori</p>
            <p className="text-[13px] text-[#6A7585] mt-1">Le cœur sur une fiche l’ajoute ici. Une fiche reçue par invitation y atterrit aussi.</p>
          </div>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {shops.map((s) => (
              <li key={s.id}>
                <button type="button" onClick={() => s.public_key && router.push(`/b/${s.public_key}`)}
                  className="w-full flex items-center bg-white rounded-[18px] shadow-[0_4px_16px_rgba(47,52,58,0.06)] p-3 text-left active:scale-[0.99]">
                  <div className="w-[52px] h-[52px] rounded-xl mr-3.5 overflow-hidden grid place-items-center shrink-0 bg-[#EDF0F4]">
                    {s.cover_url
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={s.cover_url} alt="" className="w-full h-full object-cover" />
                      : <span className="text-[22px]">🛍️</span>}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[16px] font-semibold text-[#2F343A] truncate">{s.name}</div>
                    <div className="text-[13px] text-[#6A7585] truncate">{[KIND_LABEL[s.kind || 'boutique'] || 'Fiche', s.items_count ? `${s.items_count} article${s.items_count > 1 ? 's' : ''}` : null, s.address].filter(Boolean).join(' · ')}</div>
                  </div>
                  <Heart className="w-5 h-5 text-[#FF3B4E] shrink-0" fill="currentColor" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
