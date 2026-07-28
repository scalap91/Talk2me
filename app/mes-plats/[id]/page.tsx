'use client';

/**
 * NIVEAU 2 « Les plats de la fiche » — miroir PlatManageScreen natif (Pascal 2026-07-28).
 * Les plats s'affichent en RANGÉES HORIZONTALES (assiette + nom + prix + statut), pour les DISSOCIER
 * des articles boutique (qui, eux, sont en grille). Supprimer par plat. Bouton + → éditer la fiche
 * (AddPlatMaisonSheet, où l'on ajoute/modifie les plats).
 */
import { useEffect, useState, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ArrowLeft, Plus, Trash2 } from '@/lib/icons';
import AddPlatMaisonSheet from '@/components/feed/AddPlatMaisonSheet';

type Dish = { id: string; label: string | null; price_cents: number | null; quantity: number | null; image_url: string | null; active_until: number | null; is_online?: boolean };
type PlatInitial = { id: string; name?: string; dishes?: { image_url?: string; label?: string; price?: string }[]; lat?: number; lng?: number };

export default function PlatManagePage() {
  const router = useRouter();
  const params = useParams();
  const shopId = String(params?.id || '');
  const [dishes, setDishes] = useState<Dish[]>([]);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);

  const load = useCallback(async () => {
    if (!shopId) return;
    setLoading(true);
    try {
      const r = await fetch(`/api/plat-maison/dishes?shop_id=${encodeURIComponent(shopId)}`, { cache: 'no-store' });
      const d = await r.json();
      setDishes(Array.isArray(d?.dishes) ? d.dishes : []);
    } catch { setDishes([]); }
    setLoading(false);
  }, [shopId]);
  useEffect(() => { load(); }, [load]);

  const del = async (dish: Dish) => {
    if (!confirm(`Retirer « ${dish.label || 'ce plat'} » ?`)) return;
    await fetch(`/api/simple-shop/${shopId}/item`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: dish.id }) }).catch(() => {});
    load();
  };

  const price = (d: Dish) => (d.price_cents != null ? `${Math.round(d.price_cents / 100).toLocaleString('fr-FR')} Ar` : '');

  return (
    <div className="min-h-screen bg-[#F7F8FA]">
      <header className="sticky top-0 z-10 flex items-center gap-2 px-3 h-14 bg-white border-b border-[#EDF0F4]">
        <button type="button" onClick={() => router.back()} aria-label="Retour" className="w-9 h-9 grid place-items-center rounded-full text-[#2F343A] active:scale-95">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-[16px] font-extrabold text-[#2F343A]" style={{ fontFamily: "'Outfit',sans-serif" }}>Les plats</h1>
      </header>

      <div className="px-3 pt-3 pb-28">
        {loading ? (
          <p className="text-center text-[#9DAAB7] text-[13px] mt-10">Chargement…</p>
        ) : dishes.length === 0 ? (
          <div className="text-center mt-16 px-6">
            <div className="text-[40px] mb-2">🍲</div>
            <p className="text-[15px] font-bold text-[#2F343A]" style={{ fontFamily: "'Outfit',sans-serif" }}>Aucun plat</p>
            <p className="text-[13px] text-[#6A7585] mt-1">Appuie sur + pour ajouter un plat à cette fiche.</p>
          </div>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {dishes.map((d) => (
              <li key={d.id}>
                {/* HORIZONTAL (rangée), pour dissocier des articles boutique (grille). */}
                <div className="w-full flex items-center gap-3 bg-white border border-[#EAECEF] rounded-2xl p-2.5">
                  <div className="w-[62px] h-[62px] shrink-0 rounded-xl bg-[#FFF3E6] overflow-hidden grid place-items-center">
                    {d.image_url ? <img src={d.image_url} alt="" className="w-full h-full object-cover" /> : <span className="text-[22px]">🍲</span>}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[14.5px] font-bold text-[#2F343A] truncate" style={{ fontFamily: "'Outfit',sans-serif" }}>{d.label || 'Plat'}</div>
                    <div className="text-[12.5px] text-[#6A7585] truncate">{[price(d), d.is_online ? 'En ligne' : 'Hors ligne'].filter(Boolean).join(' · ')}</div>
                  </div>
                  <button type="button" onClick={() => del(d)} aria-label="Retirer le plat" className="w-9 h-9 grid place-items-center rounded-full text-[#9AA3AF] active:scale-90"><Trash2 className="w-[18px] h-[18px]" /></button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <button type="button" onClick={() => setEditOpen(true)} aria-label="Ajouter un plat" className="fixed bottom-24 left-5 w-14 h-14 rounded-2xl bg-[#FF7F11] text-white grid place-items-center shadow-[0_8px_24px_rgba(255,127,17,0.4)] active:scale-95">
        <Plus className="w-7 h-7" />
      </button>

      {editOpen && (
        <AddPlatMaisonSheet
          initial={{ id: shopId, dishes: dishes.map((d) => ({ image_url: d.image_url || undefined, label: d.label || '', price: d.price_cents != null ? String(Math.round(d.price_cents / 100)) : '' })) } as unknown as PlatInitial as never}
          onClose={() => setEditOpen(false)}
          onCreated={() => { setEditOpen(false); load(); }}
        />
      )}
    </div>
  );
}
