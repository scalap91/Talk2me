'use client';

/**
 * Talk2Me — Mes réservations (côté PROPRIÉTAIRE). Boîte des demandes de location reçues :
 * accepter / refuser. Pascal 2026-08-12 : l'ÉDITION du planning (bloquer/débloquer les jours)
 * n'est PLUS ici — elle vit sur la FICHE (composer, une seule place). Ici on OPÈRE, pas on édite.
 */
import { useEffect, useState, useCallback } from 'react';
import { X, Car, Loader2, Check, Ban, Clock } from '@/lib/icons';

interface Booking { id: string; vehicle_title: string; start_date: string; end_date: string; days: number; total_label: string; status: string; pickup_time: string | null; return_time: string | null; renter: { username: string; display_name: string | null } | null }

export default function MyRentalsSheet({ onClose }: { onClose: () => void }) {
  const [loading, setLoading] = useState(true);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [actOn, setActOn] = useState<string | null>(null);

  const loadBookings = useCallback(() => {
    fetch('/api/drive/rentals/bookings', { cache: 'no-store' })
      .then((r) => r.json()).then((d) => { if (d?.ok) setBookings(d.bookings || []); })
      .catch(() => {}).finally(() => setLoading(false));
  }, []);
  useEffect(() => { loadBookings(); }, [loadBookings]);

  const decide = async (id: string, action: 'accept' | 'refuse') => {
    if (actOn) return;
    setActOn(id);
    try {
      const r = await fetch('/api/drive/rentals/bookings', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bookingId: id, action }),
      }).then((x) => x.json());
      if (r?.ok) loadBookings();
      else alert('Action impossible (dates déjà prises ?).');
    } finally { setActOn(null); }
  };

  return (
    <div className="fixed inset-0 z-[80] bg-black/70 backdrop-blur-sm flex items-end" onClick={onClose}>
      <div className="w-full max-h-[90dvh] overflow-y-auto bg-[#101015] rounded-t-3xl border-t border-white/10 p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-white font-semibold text-[16px] inline-flex items-center gap-2">
            <Car className="w-5 h-5 text-white/80" /> Mes réservations
          </h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/10 grid place-items-center text-white/80"><X className="w-4 h-4" /></button>
        </div>

        {loading ? (
          <div className="py-16 grid place-items-center text-white/40"><Loader2 className="w-6 h-6 animate-spin" /></div>
        ) : bookings.length === 0 ? (
          <div className="py-14 text-center px-6">
            <Car className="w-8 h-8 text-white/25 mx-auto mb-3" strokeWidth={1.6} />
            <p className="text-white/60 text-[14px] font-medium">Aucune demande de réservation.</p>
            <p className="text-white/35 text-[12.5px] mt-1">Pour gérer tes disponibilités, ouvre la fiche du véhicule dans <b>Mes véhicules</b> : le calendrier est sur la fiche.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {bookings.map((bk) => (
              <div key={bk.id} className="bg-white/[0.05] border border-white/10 rounded-xl p-2.5">
                <div className="text-white text-[13.5px] font-semibold truncate">{bk.vehicle_title}</div>
                <div className="text-white/60 text-[12px] mt-0.5">{bk.renter ? (bk.renter.display_name || '@' + bk.renter.username) : 'Locataire'} · {bk.start_date} → {bk.end_date} · {bk.days} j · {bk.total_label}</div>
                {bk.pickup_time && (
                  <div className="text-amber-200/90 text-[11.5px] mt-1 inline-flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" /> Prise à {bk.pickup_time} · retour à {bk.return_time || bk.pickup_time}
                  </div>
                )}
                {bk.status === 'pending' ? (
                  <div className="flex gap-2 mt-2">
                    <button onClick={() => decide(bk.id, 'accept')} disabled={actOn === bk.id} className="flex-1 h-8 rounded-full bg-emerald-500 text-black text-[12.5px] font-semibold inline-flex items-center justify-center gap-1 disabled:opacity-50">{actOn === bk.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Accepter</button>
                    <button onClick={() => decide(bk.id, 'refuse')} disabled={actOn === bk.id} className="flex-1 h-8 rounded-full bg-white/10 text-white/80 text-[12.5px] font-semibold inline-flex items-center justify-center gap-1 disabled:opacity-50"><Ban className="w-3.5 h-3.5" /> Refuser</button>
                  </div>
                ) : <div className="text-emerald-300 text-[11px] mt-1">✓ Acceptée</div>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
