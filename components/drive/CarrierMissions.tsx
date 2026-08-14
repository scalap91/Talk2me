'use client';
/**
 * Talk2Me — MES COLIS EN COURS (Drive Chauffeur, 4b-1 inc.2, Pascal 2026-08-10).
 * Surface dans la vue Chauffeur les colis que je DÉTIENS (shipments custody = moi, non livrés) →
 * la « une seule liste » (courses + colis) côté chauffeur. Réutilise listMyShipments (/api/transport/shipments)
 * + le tracker existant DeliveryTracking (pas de nouveau moteur). L'action collecte/livraison au code sera
 * rapatriée à l'incrément 3 (aujourd'hui : tap → suivi + code). Les missions ASSIGNÉES (non encore prises,
 * modèle legs/dispatch) viendront avec la Phase 4b-2 (dispatch dans Drive).
 */
import { useEffect, useState } from 'react';
import { Package } from '@/lib/icons';
import DeliveryTracking from '@/components/feed/DeliveryTracking';

interface Ship { id: string; tracking: string; product_label: string | null; status: string; o_label: string; d_label: string; custody_user_id?: string | null; parcel_size?: string | null }
const STATUS_FR: Record<string, string> = { created: 'À prendre', at_depot: 'Au dépôt', ready_for_pickup: 'À remettre', in_transit: 'En cours', delivered: 'Livré', cancelled: 'Annulé' };

export default function CarrierMissions() {
  const [ships, setShips] = useState<Ship[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<string | null>(null);

  const load = async () => {
    try {
      const [meD, shD] = await Promise.all([
        fetch('/api/auth/me', { cache: 'no-store' }).then((r) => r.json()).catch(() => null),
        fetch('/api/transport/shipments', { cache: 'no-store' }).then((r) => r.json()).catch(() => null),
      ]);
      const id = meD?.user?.id || '';
      const all = (shD?.shipments || []) as Ship[];
      setShips(all.filter((s) => s.custody_user_id === id && s.status !== 'delivered' && s.status !== 'cancelled'));
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  if (open) return <DeliveryTracking shipmentId={open} onClose={() => { setOpen(null); load(); }} />;
  if (loading || ships.length === 0) return null;

  return (
    <div>
      <div className="text-gray-400 text-sm mb-2">📦 Mes colis en cours · {ships.length}</div>
      <div className="flex flex-col gap-2">
        {ships.map((s) => (
          <button key={s.id} onClick={() => setOpen(s.id)} className="w-full flex items-center gap-3 p-3 rounded-xl border border-[#E7EAF0] bg-white text-left active:scale-95">
            <span className="w-9 h-9 rounded-xl bg-amber-500/15 grid place-items-center shrink-0"><Package className="w-4 h-4 text-amber-600" /></span>
            <div className="min-w-0 flex-1">
              <div className="text-[14px] font-semibold text-[#2F343A] truncate">{s.product_label || 'Colis'} · {STATUS_FR[s.status] || s.status}</div>
              <div className="text-[11.5px] text-[#9DAAB7] truncate">{s.o_label} → {s.d_label} · <span className="font-mono">{s.tracking}</span></div>
              {s.parcel_size && <div className="text-[11px] text-amber-700 mt-0.5">📐 {s.parcel_size}</div>}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
