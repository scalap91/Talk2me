'use client';

/** « Mes restos » — miroir MyRestosScreen natif (Pascal 2026-07-28, Phase 2). Liste /api/eat/mine + bouton +. */
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Plus } from '@/lib/icons';
import AddRestaurantSheet from '@/components/feed/AddRestaurantSheet';

type Resto = { id: string; name: string; description?: string | null; cover_url?: string | null };

export default function MesRestosPage() {
  const router = useRouter();
  const [items, setItems] = useState<Resto[]>([]);
  const [loading, setLoading] = useState(true);
  const [edit, setEdit] = useState<Resto | null | undefined>(undefined);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/eat/mine', { cache: 'no-store' });
      const d = await r.json();
      setItems(Array.isArray(d?.restaurants) ? d.restaurants : []);
    } catch { setItems([]); }
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="min-h-screen bg-white">
      <header className="sticky top-0 z-10 flex items-center gap-2 px-3 h-14 bg-white border-b border-[#EDF0F4]">
        <button type="button" onClick={() => router.back()} aria-label="Retour" className="w-9 h-9 grid place-items-center rounded-full text-[#2F343A] active:scale-95">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-[17px] font-extrabold text-[#2F343A]" style={{ fontFamily: "'Outfit',sans-serif" }}>Mes restos</h1>
      </header>

      <div className="px-4 pt-3 pb-28">
        {loading ? (
          <p className="text-center text-[#9DAAB7] text-[13px] mt-10">Chargement…</p>
        ) : items.length === 0 ? (
          <div className="text-center mt-16 px-6">
            <div className="text-[40px] mb-2">🍽️</div>
            <p className="text-[15px] font-bold text-[#2F343A]" style={{ fontFamily: "'Outfit',sans-serif" }}>Aucun resto</p>
            <p className="text-[13px] text-[#6A7585] mt-1">Appuie sur + pour publier ta carte sur Eat.</p>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {items.map((s) => (
              <li key={s.id}>
                <button type="button" onClick={() => setEdit(s)} className="w-full flex items-center gap-3 bg-[#F7F8FA] border border-[#EAECEF] rounded-2xl p-2.5 text-left active:scale-[0.99] transition">
                  <div className="w-14 h-14 shrink-0 rounded-xl bg-[#EDF0F4] overflow-hidden grid place-items-center">
                    {s.cover_url ? <img src={s.cover_url} alt="" className="w-full h-full object-cover" /> : <span className="text-[20px]">🍽️</span>}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[14px] font-bold text-[#2F343A] truncate" style={{ fontFamily: "'Outfit',sans-serif" }}>{s.name || 'Mon resto'}</div>
                    <div className="text-[12px] text-[#6A7585] truncate">{s.description || 'Gérer la carte'}</div>
                  </div>
                  <span className="shrink-0 text-[#9DAAB7] text-[18px]">›</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <button type="button" onClick={() => setEdit(null)} aria-label="Nouveau resto" className="fixed bottom-24 right-5 w-14 h-14 rounded-2xl bg-[#FF7F11] text-white grid place-items-center shadow-[0_8px_24px_rgba(255,127,17,0.4)] active:scale-95">
        <Plus className="w-7 h-7" />
      </button>

      {edit !== undefined && (
        <AddRestaurantSheet
          initial={edit ? (edit as never) : undefined}
          onClose={() => setEdit(undefined)}
          onCreated={() => { setEdit(undefined); load(); }}
        />
      )}
    </div>
  );
}
