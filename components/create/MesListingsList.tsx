'use client';

/**
 * Écran « Mes X » pour Service / Emploi (Pascal 2026-07-28, Phase 2 — cale le web sur le natif).
 * LISTE de mes annonces service/emploi (`/api/simple-shop/listings?kind=…`, flag `mine`) + bouton +
 * qui ouvre le composer dédié. Miroir de MyListingsScreen(kind) natif.
 */
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Plus } from '@/lib/icons';

type Listing = { id: string; name: string; category?: string | null; tarif?: string | null; place?: string | null; cover_url?: string | null; mine?: boolean };

export default function MesListingsList({
  title, emoji, emptyText, kind, Sheet,
}: {
  title: string;
  emoji: string;
  emptyText: string;
  kind: 'service' | 'emploi';
  Sheet: React.ComponentType<{ open: boolean; onClose: () => void }>;
}) {
  const router = useRouter();
  const [items, setItems] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [create, setCreate] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/simple-shop/listings?kind=${kind}`, { cache: 'no-store' });
      const d = await r.json();
      const list: Listing[] = Array.isArray(d?.listings) ? d.listings : [];
      setItems(list.filter((l) => l.mine));
    } catch { setItems([]); }
    setLoading(false);
  }, [kind]);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="min-h-screen bg-white">
      <header className="sticky top-0 z-10 flex items-center gap-2 px-3 h-14 bg-white border-b border-[#EDF0F4]">
        <button type="button" onClick={() => router.back()} aria-label="Retour" className="w-9 h-9 grid place-items-center rounded-full text-[#2F343A] active:scale-95">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-[17px] font-extrabold text-[#2F343A]" style={{ fontFamily: "'Outfit',sans-serif" }}>{title}</h1>
      </header>

      <div className="px-4 pt-3 pb-28">
        {loading ? (
          <p className="text-center text-[#9DAAB7] text-[13px] mt-10">Chargement…</p>
        ) : items.length === 0 ? (
          <div className="text-center mt-16 px-6">
            <div className="text-[40px] mb-2">{emoji}</div>
            <p className="text-[15px] font-bold text-[#2F343A]" style={{ fontFamily: "'Outfit',sans-serif" }}>Rien pour l’instant</p>
            <p className="text-[13px] text-[#6A7585] mt-1">{emptyText}</p>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {items.map((s) => (
              <li key={s.id}>
                <div className="w-full flex items-center gap-3 bg-[#F7F8FA] border border-[#EAECEF] rounded-2xl p-2.5">
                  <div className="w-14 h-14 shrink-0 rounded-xl bg-[#EDF0F4] overflow-hidden grid place-items-center">
                    {s.cover_url ? <img src={s.cover_url} alt="" className="w-full h-full object-cover" /> : <span className="text-[20px]">{emoji}</span>}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[14px] font-bold text-[#2F343A] truncate" style={{ fontFamily: "'Outfit',sans-serif" }}>{s.name || 'Sans titre'}</div>
                    <div className="text-[12px] text-[#6A7585] truncate">{[s.category, s.tarif, s.place].filter(Boolean).join(' · ') || '—'}</div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <button type="button" onClick={() => setCreate(true)} aria-label={`Ajouter — ${title}`} className="fixed bottom-24 right-5 w-14 h-14 rounded-2xl bg-[#FF7F11] text-white grid place-items-center shadow-[0_8px_24px_rgba(255,127,17,0.4)] active:scale-95">
        <Plus className="w-7 h-7" />
      </button>

      <Sheet open={create} onClose={() => { setCreate(false); load(); }} />
    </div>
  );
}
