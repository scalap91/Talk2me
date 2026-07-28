'use client';
/**
 * « Livraison » — écran unique du profil qui suit TOUTES mes livraisons (Pascal 2026-07-26).
 * Liste `listMyShipments` (acheteur / vendeur / détenteur) → tap → suivi RÉEL (Système B) via
 * la brique re-câblée `DeliveryTracking`. Une seule vérité : toutes les sources (boutique, Eat,
 * colis P2P) créent un shipment → tout retombe ici.
 */
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { smartBack } from '@/lib/client/smart-back';
import { Loader2, Truck } from '@/lib/icons';
import DeliveryTracking from '@/components/feed/DeliveryTracking';

interface Ship { id: string; tracking: string; product_label: string | null; status: string; o_label: string; d_label: string; mode?: string | null }
const STATUS_FR: Record<string, string> = { created: 'En préparation', at_depot: 'Au dépôt', in_transit: 'En route', ready_for_pickup: 'Prêt à retirer', delivered: 'Livré', cancelled: 'Annulé' };
const DOT: Record<string, string> = { created: 'bg-white/40', at_depot: 'bg-sky-400', in_transit: 'bg-amber-400', ready_for_pickup: 'bg-emerald-400', delivered: 'bg-emerald-500', cancelled: 'bg-red-400' };

export default function LivraisonPage() {
  const router = useRouter();
  const [ships, setShips] = useState<Ship[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<string | null>(null);

  const load = async () => {
    try { const d = await fetch('/api/transport/shipments', { cache: 'no-store' }).then((r) => r.json()); setShips((d?.shipments || []) as Ship[]); } catch { /* */ }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  if (open) return <DeliveryTracking shipmentId={open} onClose={() => { setOpen(null); load(); }} />;

  const actifs = ships.filter((s) => s.status !== 'delivered' && s.status !== 'cancelled');
  const finis = ships.filter((s) => s.status === 'delivered' || s.status === 'cancelled');

  const row = (s: Ship) => (
    <button key={s.id} onClick={() => setOpen(s.id)} className="w-full flex items-center gap-3 py-3 border-b border-white/[0.06] last:border-0 text-left">
      <div className="w-9 h-9 rounded-xl bg-amber-500/15 grid place-items-center shrink-0"><Truck className="w-4 h-4 text-amber-300" /></div>
      <div className="flex-1 min-w-0">
        <div className="text-[14px] text-white/90 truncate">{s.product_label || 'Colis'}</div>
        <div className="text-[11.5px] text-white/45 truncate">{s.o_label} → {s.d_label} · <span className="font-mono text-white/40">{s.tracking}</span></div>
      </div>
      <span className="shrink-0 flex items-center gap-1.5 text-[11.5px] text-white/60">
        <span className={'w-2 h-2 rounded-full ' + (DOT[s.status] || 'bg-white/40')} />{STATUS_FR[s.status] || s.status}
      </span>
    </button>
  );

  return (
    <div className="min-h-screen bg-[#0e0e14] text-white px-4 py-6 t2m-page">
      <button onClick={() => smartBack(router, '/profile')} className="text-white/50 text-sm mb-4">← Retour</button>
      <h1 className="text-[18px] font-bold mb-1">Livraison</h1>
      <p className="text-[12.5px] text-white/45 mb-5">Suis toutes tes livraisons en temps réel.</p>

      {loading ? <div className="grid place-items-center py-20 text-white/50"><Loader2 className="w-6 h-6 animate-spin" /></div>
        : ships.length === 0 ? <p className="text-[13px] text-white/40 mt-8 text-center">Aucune livraison pour l’instant.<br />Tes achats livrés et tes colis apparaîtront ici.</p>
        : (
          <>
            {actifs.length > 0 && (
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 mb-4">
                <h2 className="text-[13px] font-semibold text-white/70 pt-3.5 pb-1">En cours · {actifs.length}</h2>
                {actifs.map(row)}
              </div>
            )}
            {finis.length > 0 && (
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4">
                <h2 className="text-[13px] font-semibold text-white/50 pt-3.5 pb-1">Terminées</h2>
                {finis.map(row)}
              </div>
            )}
          </>
        )}
    </div>
  );
}
