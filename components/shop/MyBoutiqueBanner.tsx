'use client';

/**
 * Talk2Me — Accès « Ma boutique » en haut de l'onglet Shop (Pascal 2026-06-11 :
 * « où est le bouton boutique »). Thème CLAIR (le Shop est blanc). Liste les
 * petites boutiques de l'utilisateur ; sinon propose d'en créer une.
 */
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Store, Plus, ChevronRight } from 'lucide-react';

interface Shop { id: string; name: string }

export default function MyBoutiqueBanner() {
  const router = useRouter();
  const [shops, setShops] = useState<Shop[] | null>(null);

  useEffect(() => {
    let alive = true;
    fetch('/api/simple-shop', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive) setShops(d?.ok ? (d.shops || []) : []); })
      .catch(() => { if (alive) setShops([]); });
    return () => { alive = false; };
  }, []);

  if (shops === null) return null; // évite le flash

  return (
    <div className="px-3 mt-2">
      <div className="rounded-2xl border border-red-200 bg-red-50 p-2.5">
        <div className="flex items-center gap-2 mb-2">
          <span className="w-7 h-7 rounded-full bg-red-600 text-white grid place-items-center shrink-0"><Store className="w-4 h-4" /></span>
          <span className="text-[13px] font-semibold text-neutral-800">Ma boutique</span>
        </div>

        {shops.length > 0 ? (
          <div className="flex flex-col gap-1.5">
            {shops.map((s) => (
              <button
                key={s.id}
                onClick={() => router.push(`/ma-boutique/${s.id}`)}
                className="w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl bg-white border border-neutral-200 active:scale-[0.99]"
              >
                <span className="text-[14px] font-medium text-neutral-900 truncate">{s.name}</span>
                <ChevronRight className="w-4 h-4 text-neutral-400 shrink-0" />
              </button>
            ))}
            <button
              onClick={() => router.push('/boutique/creer')}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-dashed border-red-300 text-red-600 text-[13px] font-semibold"
            >
              <Plus className="w-4 h-4" /> Nouvelle boutique
            </button>
          </div>
        ) : (
          <button
            onClick={() => router.push('/boutique/creer')}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-red-600 text-white text-[13px] font-semibold active:scale-[0.99]"
          >
            <Plus className="w-4 h-4" /> Créer ma boutique
          </button>
        )}
      </div>
    </div>
  );
}
