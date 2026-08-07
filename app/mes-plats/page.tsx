'use client';

/**
 * « Mes plats de Mama » — NIVEAU 1, miroir MyPlatsScreen natif (Pascal 2026-07-28).
 * Rangées HORIZONTALES (dissocier des articles boutique) : assiette + nom + « X/Y plats en ligne »
 * + stylo (éditer la fiche) + poubelle (supprimer) + chevron. Tap la ligne → NIVEAU 2 (/mes-plats/[id]).
 * Bouton + → créer un resto Mama (AddPlatMaisonSheet).
 */
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Pencil, Trash2 } from '@/lib/icons';
import BackButton from '@/components/system/BackButton';
import AddPlatMaisonSheet from '@/components/feed/AddPlatMaisonSheet';

type Plat = { id: string; name: string; cover_url?: string | null; items_count?: number; online_count?: number };

export default function MesPlatsPage() {
  const router = useRouter();
  const [items, setItems] = useState<Plat[]>([]);
  const [loading, setLoading] = useState(true);
  const [edit, setEdit] = useState<Plat | null | undefined>(undefined); // undefined=fermé · null=nouvelle · objet=édition fiche

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/plat-maison/mine', { cache: 'no-store' });
      const d = await r.json();
      setItems(Array.isArray(d?.plats) ? d.plats : []);
    } catch { setItems([]); }
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const del = async (p: Plat) => {
    if (!confirm(`Supprimer « ${p.name || 'ce resto Mama'} » ? Tous ses plats seront retirés.`)) return;
    await fetch('/api/simple-shop', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: p.id }) }).catch(() => {});
    load();
  };

  const subtitle = (p: Plat) => {
    const n = p.items_count || 0;
    if (n === 0) return 'Aucun plat';
    return `${p.online_count || 0}/${n} plat${n > 1 ? 's' : ''} en ligne`;
  };

  return (
    <div className="min-h-screen bg-[#F7F8FA]">
      <header className="sticky top-0 z-10 flex items-center gap-2 px-3 h-14 bg-white border-b border-[#EDF0F4]">
        <BackButton size={20} className="w-9 h-9 grid place-items-center rounded-full text-[#2F343A] hover:text-black transition-colors active:scale-95" />
        <h1 className="text-[16px] font-extrabold text-[#2F343A]" style={{ fontFamily: "'Outfit',sans-serif" }}>Mes plats de Mama</h1>
      </header>

      <div className="px-3 pt-3 pb-28">
        {loading ? (
          <p className="text-center text-[#9DAAB7] text-[13px] mt-10">Chargement…</p>
        ) : items.length === 0 ? (
          <div className="text-center mt-16 px-6">
            <div className="text-[40px] mb-2">🍲</div>
            <p className="text-[15px] font-bold text-[#2F343A]" style={{ fontFamily: "'Outfit',sans-serif" }}>Aucun resto Mama</p>
            <p className="text-[13px] text-[#6A7585] mt-1">Appuie sur + pour proposer tes plats aux voisins.</p>
          </div>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {items.map((p) => (
              <li key={p.id}>
                {/* NIVEAU 1 : rangée HORIZONTALE (dissocie des articles boutique qui sont en grille) */}
                <div className="w-full flex items-center gap-3 bg-white border border-[#EAECEF] rounded-2xl p-2.5">
                  <button type="button" onClick={() => router.push(`/mes-plats/${p.id}`)} className="flex items-center gap-3 flex-1 min-w-0 text-left active:scale-[0.99] transition">
                    <div className="w-[60px] h-[60px] shrink-0 rounded-xl bg-[#FFF3E6] overflow-hidden grid place-items-center">
                      {p.cover_url ? <img src={p.cover_url} alt="" className="w-full h-full object-cover" /> : <span className="text-[22px]">🍲</span>}
                    </div>
                    <div className="min-w-0">
                      <div className="text-[14.5px] font-bold text-[#2F343A] truncate" style={{ fontFamily: "'Outfit',sans-serif" }}>{p.name || 'Resto Mama'}</div>
                      <div className={`text-[12.5px] font-bold truncate ${(p.online_count || 0) > 0 ? 'text-[#16A34A]' : 'text-[#9AA3AF]'}`}>{subtitle(p)}</div>
                    </div>
                  </button>
                  <button type="button" onClick={() => setEdit(p)} aria-label="Modifier la fiche" className="w-9 h-9 grid place-items-center rounded-full text-[#6A7585] active:scale-90"><Pencil className="w-[18px] h-[18px]" /></button>
                  <button type="button" onClick={() => del(p)} aria-label="Supprimer" className="w-9 h-9 grid place-items-center rounded-full text-[#9AA3AF] active:scale-90"><Trash2 className="w-[18px] h-[18px]" /></button>
                  <span className="shrink-0 text-[#C7CDD4] text-[18px] pr-1">›</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Bouton + orange carré-arrondi (kAccent natif), en bas à GAUCHE comme le modèle boutique. */}
      <button type="button" onClick={() => setEdit(null)} aria-label="Nouveau resto Mama" className="fixed bottom-24 left-5 w-14 h-14 rounded-2xl bg-[#FF7F11] text-white grid place-items-center shadow-[0_8px_24px_rgba(255,127,17,0.4)] active:scale-95">
        <Plus className="w-7 h-7" />
      </button>

      {edit !== undefined && (
        <AddPlatMaisonSheet
          initial={edit ? (edit as never) : undefined}
          onClose={() => setEdit(undefined)}
          onCreated={() => { setEdit(undefined); load(); }}
        />
      )}
    </div>
  );
}
