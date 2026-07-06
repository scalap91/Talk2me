'use client';

/* eslint-disable @next/next/no-img-element */
/**
 * Talk2Me — Mes locations : planning propriétaire (Pascal 2026-06-26, Phase 1).
 * Liste mes véhicules en location → calendrier mensuel : je bloque/débloque les jours
 * (entretien, usage perso). 🟢 libre · ⚪ bloqué · 🔴 réservé (Phase 2).
 */
import { useEffect, useState, useCallback } from 'react';
import { X, Car, ChevronLeft, ChevronRight, Loader2, Check, Ban, Clock } from '@/lib/icons';

interface Vehicle { id: string; title: string; image_url: string | null; city: string | null; price_label: string | null }
interface Booking { id: string; vehicle_title: string; start_date: string; end_date: string; days: number; total_label: string; status: string; pickup_time: string | null; return_time: string | null; renter: { username: string; display_name: string | null } | null }
const MONTHS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
const WD = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

export default function MyRentalsSheet({ onClose }: { onClose: () => void }) {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [sel, setSel] = useState<Vehicle | null>(null);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const [ym, setYm] = useState({ y: today.getFullYear(), m: today.getMonth() });
  const [blocked, setBlocked] = useState<Set<string>>(new Set());
  const [booked, setBooked] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState<string | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [actOn, setActOn] = useState<string | null>(null);

  const loadBookings = useCallback(() => {
    fetch('/api/drive/rentals/bookings', { cache: 'no-store' })
      .then((r) => r.json()).then((d) => { if (d?.ok) setBookings(d.bookings || []); }).catch(() => {});
  }, []);

  useEffect(() => {
    fetch('/api/drive/my-rentals', { cache: 'no-store' })
      .then((r) => r.json()).then((d) => { if (d?.ok) setVehicles(d.vehicles || []); })
      .catch(() => {}).finally(() => setLoading(false));
    loadBookings();
  }, [loadBookings]);

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

  const loadAvail = useCallback((id: string) => {
    fetch(`/api/drive/availability?id=${encodeURIComponent(id)}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => { if (d?.ok) { setBlocked(new Set(d.blocked || [])); setBooked(new Set(d.booked || [])); } })
      .catch(() => {});
  }, []);

  const openVehicle = (v: Vehicle) => { setSel(v); setBlocked(new Set()); setBooked(new Set()); loadAvail(v.id); };

  const fmt = (d: number) => `${ym.y}-${String(ym.m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const shiftMonth = (delta: number) => setYm((p) => {
    const nm = p.m + delta;
    return { y: p.y + Math.floor(nm / 12) - (nm < 0 ? 1 : 0), m: ((nm % 12) + 12) % 12 };
  });

  const toggle = async (dateStr: string) => {
    if (!sel || saving) return;
    if (booked.has(dateStr)) return; // jour réservé : non modifiable
    const willBlock = !blocked.has(dateStr);
    setSaving(dateStr);
    // Optimiste
    setBlocked((prev) => { const n = new Set(prev); if (willBlock) n.add(dateStr); else n.delete(dateStr); return n; });
    try {
      const r = await fetch('/api/drive/availability', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: sel.id, date: dateStr, blocked: willBlock }),
      }).then((x) => x.json());
      if (!r?.ok) setBlocked((prev) => { const n = new Set(prev); if (willBlock) n.delete(dateStr); else n.add(dateStr); return n; }); // rollback
    } finally { setSaving(null); }
  };

  const first = new Date(ym.y, ym.m, 1);
  const startWd = (first.getDay() + 6) % 7; // Lundi = 0
  const nbDays = new Date(ym.y, ym.m + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(startWd).fill(null), ...Array.from({ length: nbDays }, (_, i) => i + 1)];

  return (
    <div className="fixed inset-0 z-[80] bg-black/70 backdrop-blur-sm flex items-end" onClick={onClose}>
      <div className="w-full max-h-[90dvh] overflow-y-auto bg-[#101015] rounded-t-3xl border-t border-white/10 p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-white font-semibold text-[16px] inline-flex items-center gap-2">
            {sel ? <button onClick={() => setSel(null)} className="text-white/70"><ChevronLeft className="w-5 h-5" /></button> : <Car className="w-5 h-5 text-white/80" />}
            {sel ? sel.title : 'Mes locations'}
          </h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/10 grid place-items-center text-white/80"><X className="w-4 h-4" /></button>
        </div>

        {!sel ? (
          <>
            {bookings.length > 0 && (
              <div className="mb-3">
                <p className="text-[12px] font-semibold text-white/70 mb-1.5">Demandes de réservation</p>
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
              </div>
            )}
            {loading ? (
            <div className="py-16 grid place-items-center text-white/40"><Loader2 className="w-6 h-6 animate-spin" /></div>
          ) : vehicles.length === 0 ? (
            <div className="py-14 text-center px-6">
              <Car className="w-8 h-8 text-white/25 mx-auto mb-3" strokeWidth={1.6} />
              <p className="text-white/60 text-[14px] font-medium">Tu n&apos;as pas de véhicule en location.</p>
              <p className="text-white/35 text-[12.5px] mt-1">Dépose une annonce Véhicules en « Location » pour gérer son planning ici.</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {vehicles.map((v) => (
                <button key={v.id} onClick={() => openVehicle(v)} className="w-full flex items-center gap-3 bg-white/[0.05] border border-white/10 rounded-xl p-2.5 text-left active:scale-[0.99]">
                  <div className="w-14 h-14 rounded-lg bg-black/30 overflow-hidden shrink-0">
                    {v.image_url ? <img src={v.image_url} alt="" className="w-full h-full object-cover" /> : <span className="w-full h-full grid place-items-center text-white/30"><Car className="w-6 h-6" /></span>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-white text-[14px] font-semibold truncate">{v.title}</div>
                    <div className="text-white/55 text-[12px]">{v.price_label ? `${v.price_label} / jour` : 'Prix à définir'}{v.city ? ` · ${v.city}` : ''}</div>
                    <div className="text-emerald-300 text-[11px] mt-0.5">Gérer le planning →</div>
                  </div>
                </button>
              ))}
            </div>
          )}
          </>
        ) : (
          <div>
            {/* Navigation mois */}
            <div className="flex items-center justify-between mb-2">
              <button onClick={() => shiftMonth(-1)} className="w-9 h-9 rounded-full bg-white/10 grid place-items-center text-white/80"><ChevronLeft className="w-5 h-5" /></button>
              <span className="text-white font-semibold text-[15px]">{MONTHS[ym.m]} {ym.y}</span>
              <button onClick={() => shiftMonth(1)} className="w-9 h-9 rounded-full bg-white/10 grid place-items-center text-white/80"><ChevronRight className="w-5 h-5" /></button>
            </div>
            <div className="grid grid-cols-7 gap-1 mb-1">
              {WD.map((d, i) => <div key={i} className="text-center text-[11px] text-white/35 py-1">{d}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {cells.map((d, i) => {
                if (d === null) return <div key={i} />;
                const ds = fmt(d);
                const dayDate = new Date(ym.y, ym.m, d); dayDate.setHours(0, 0, 0, 0);
                const isPast = dayDate < today;
                const isBooked = booked.has(ds);
                const isBlocked = blocked.has(ds);
                const cls = isPast ? 'bg-white/[0.02] text-white/20'
                  : isBooked ? 'bg-red-600/80 text-white'
                  : isBlocked ? 'bg-white/15 text-white/50 line-through'
                  : 'bg-emerald-500/15 text-emerald-100 border border-emerald-400/25';
                return (
                  <button key={i} disabled={isPast || isBooked || saving === ds}
                    onClick={() => toggle(ds)}
                    className={'aspect-square rounded-lg text-[13px] font-medium grid place-items-center active:scale-95 disabled:active:scale-100 ' + cls}>
                    {saving === ds ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : d}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-4 mt-3 text-[11px] text-white/55">
              <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded bg-emerald-500/30 border border-emerald-400/30" /> Libre</span>
              <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded bg-white/15" /> Bloqué</span>
              <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-600/80" /> Réservé</span>
            </div>
            <p className="text-[11px] text-white/35 mt-2">Touche un jour pour le bloquer/débloquer (entretien, usage perso). Les jours passés et réservés ne sont pas modifiables.</p>
          </div>
        )}
      </div>
    </div>
  );
}
