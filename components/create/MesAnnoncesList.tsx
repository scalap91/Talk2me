'use client';

/**
 * Écran « Mes X » réutilisable (Pascal 2026-07-28, Phase 2 : cale le web sur le natif).
 * LISTE des annonces existantes (filtrées par catégorie) + bouton + qui dévoile DepositAnnonceSheet.
 * Sert /mes-annonces (objets), /mes-immobilier (biens), /mes-vehicules (véhicules) — miroir des
 * MyAnnoncesScreen / MyImmoScreen / MyAutosScreen natifs.
 */
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Plus } from '@/lib/icons';
import DepositAnnonceSheet from '@/components/feed/DepositAnnonceSheet';

type Annonce = {
  id: string; title: string; category?: string | null; city?: string | null;
  price_cents?: number | null; status?: string | null;
  photos?: string[] | null; image_url?: string | null;
};

function cover(a: Annonce): string | null {
  if (Array.isArray(a.photos) && a.photos[0]) return a.photos[0];
  return a.image_url || null;
}
function priceLabel(a: Annonce): string {
  if (a.price_cents == null) return '';
  return `${Math.round(a.price_cents / 100).toLocaleString('fr-FR')} Ar`;
}

export default function MesAnnoncesList({
  title, emoji, emptyText, includeCategories, excludeCategories, presetCategory,
}: {
  title: string;
  emoji: string;
  emptyText: string;
  includeCategories?: string[]; // ne garder QUE ces catégories
  excludeCategories?: string[]; // exclure ces catégories
  presetCategory?: string;      // catégorie pré-réglée du formulaire « + »
}) {
  const router = useRouter();
  const [items, setItems] = useState<Annonce[]>([]);
  const [loading, setLoading] = useState(true);
  const [edit, setEdit] = useState<Annonce | null | undefined>(undefined); // undefined = fermé · null = nouvelle · objet = édition

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/annonces/mine', { cache: 'no-store' });
      const d = await r.json();
      let list: Annonce[] = Array.isArray(d?.annonces) ? d.annonces : [];
      if (includeCategories) list = list.filter((a) => includeCategories.includes(a.category || ''));
      if (excludeCategories) list = list.filter((a) => !excludeCategories.includes(a.category || ''));
      setItems(list);
    } catch { setItems([]); }
    setLoading(false);
  }, [includeCategories, excludeCategories]);
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
            {items.map((a) => (
              <li key={a.id}>
                <button type="button" onClick={() => setEdit(a)} className="w-full flex items-center gap-3 bg-[#F7F8FA] border border-[#EAECEF] rounded-2xl p-2.5 text-left active:scale-[0.99] transition">
                  <div className="w-14 h-14 shrink-0 rounded-xl bg-[#EDF0F4] overflow-hidden grid place-items-center">
                    {cover(a) ? <img src={cover(a) as string} alt="" className="w-full h-full object-cover" /> : <span className="text-[20px]">{emoji}</span>}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[14px] font-bold text-[#2F343A] truncate" style={{ fontFamily: "'Outfit',sans-serif" }}>{a.title || 'Sans titre'}</div>
                    <div className="text-[12px] text-[#6A7585] truncate">{[a.city, priceLabel(a)].filter(Boolean).join(' · ')}</div>
                  </div>
                  <span className={`shrink-0 text-[10.5px] font-bold px-2 py-0.5 rounded-full ${a.status === 'published' ? 'bg-[#E7F6EC] text-[#1F9254]' : 'bg-[#F0F2F5] text-[#6A7585]'}`}>
                    {a.status === 'published' ? 'En ligne' : 'Brouillon'}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Bouton + (identique natif : FAB qui dévoile le formulaire) */}
      <button
        type="button"
        onClick={() => setEdit(null)}
        aria-label={`Ajouter — ${title}`}
        className="fixed bottom-24 right-5 w-14 h-14 rounded-2xl bg-[#FF7F11] text-white grid place-items-center shadow-[0_8px_24px_rgba(255,127,17,0.4)] active:scale-95"
      >
        <Plus className="w-7 h-7" />
      </button>

      {edit !== undefined && (
        <DepositAnnonceSheet
          initial={(edit ? edit : (presetCategory ? { category: presetCategory } : undefined)) as never}
          onClose={() => setEdit(undefined)}
          onSaved={() => { setEdit(undefined); load(); }}
        />
      )}
    </div>
  );
}
