'use client';

/**
 * Talk2Me — Planning de disponibilité d'une location, ÉDITÉ DEPUIS LA FICHE (composer).
 * Source de vérité = le `.card` (id = annonce_id) ; les jours bloqués/réservés sont le
 * satellite transactionnel `rental_availability` keyé sur cet id, lu/écrit via
 * /api/drive/availability. UNE SEULE place d'édition : ce panneau, dans le composer.
 * 🟢 libre · ⚪ bloqué (entretien/perso) · 🔴 réservé (non modifiable).
 */
import { useEffect, useState, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Loader2 } from '@/lib/icons';

const MONTHS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
const WD = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

export default function RentalPlanningPanel({ annonceId }: { annonceId: string }) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const [ym, setYm] = useState({ y: today.getFullYear(), m: today.getMonth() });
  const [blocked, setBlocked] = useState<Set<string>>(new Set());
  const [booked, setBooked] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    fetch(`/api/drive/availability?id=${encodeURIComponent(annonceId)}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => { if (d?.ok) { setBlocked(new Set(d.blocked || [])); setBooked(new Set(d.booked || [])); } })
      .catch(() => {}).finally(() => setLoading(false));
  }, [annonceId]);
  useEffect(() => { load(); }, [load]);

  const fmt = (d: number) => `${ym.y}-${String(ym.m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const shiftMonth = (delta: number) => setYm((p) => {
    const nm = p.m + delta;
    return { y: p.y + Math.floor(nm / 12) - (nm < 0 ? 1 : 0), m: ((nm % 12) + 12) % 12 };
  });

  const toggle = async (dateStr: string) => {
    if (saving) return;
    if (booked.has(dateStr)) return; // jour réservé : non modifiable
    const willBlock = !blocked.has(dateStr);
    setSaving(dateStr);
    setBlocked((prev) => { const n = new Set(prev); if (willBlock) n.add(dateStr); else n.delete(dateStr); return n; }); // optimiste
    try {
      const r = await fetch('/api/drive/availability', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: annonceId, date: dateStr, blocked: willBlock }),
      }).then((x) => x.json());
      if (!r?.ok) setBlocked((prev) => { const n = new Set(prev); if (willBlock) n.delete(dateStr); else n.add(dateStr); return n; }); // rollback
    } finally { setSaving(null); }
  };

  const first = new Date(ym.y, ym.m, 1);
  const startWd = (first.getDay() + 6) % 7; // Lundi = 0
  const nbDays = new Date(ym.y, ym.m + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(startWd).fill(null), ...Array.from({ length: nbDays }, (_, i) => i + 1)];

  return (
    <div className="rounded-2xl border border-[#EAECEF] bg-[#F7F8FA] p-3">
      <div className="flex items-center justify-between mb-2">
        <button type="button" onClick={() => shiftMonth(-1)} aria-label="Mois précédent" className="w-9 h-9 rounded-full bg-white border border-[#EAECEF] grid place-items-center text-[#2F343A] active:scale-95"><ChevronLeft className="w-5 h-5" /></button>
        <span className="text-[#2F343A] font-bold text-[15px]" style={{ fontFamily: "'Outfit',sans-serif" }}>{MONTHS[ym.m]} {ym.y}</span>
        <button type="button" onClick={() => shiftMonth(1)} aria-label="Mois suivant" className="w-9 h-9 rounded-full bg-white border border-[#EAECEF] grid place-items-center text-[#2F343A] active:scale-95"><ChevronRight className="w-5 h-5" /></button>
      </div>
      <div className="grid grid-cols-7 gap-1 mb-1">
        {WD.map((d, i) => <div key={i} className="text-center text-[11px] text-[#9DAAB7] py-1">{d}</div>)}
      </div>
      {loading ? (
        <div className="py-10 grid place-items-center text-[#9DAAB7]"><Loader2 className="w-6 h-6 animate-spin" /></div>
      ) : (
        <div className="grid grid-cols-7 gap-1">
          {cells.map((d, i) => {
            if (d === null) return <div key={i} />;
            const ds = fmt(d);
            const dayDate = new Date(ym.y, ym.m, d); dayDate.setHours(0, 0, 0, 0);
            const isPast = dayDate < today;
            const isBooked = booked.has(ds);
            const isBlocked = blocked.has(ds);
            const cls = isPast ? 'bg-transparent text-[#C7CED6]'
              : isBooked ? 'bg-[#E5484D] text-white'
              : isBlocked ? 'bg-[#E7EAEE] text-[#9DAAB7] line-through'
              : 'bg-[#E7F6EC] text-[#1F9254] border border-[#BFE6CD]';
            return (
              <button key={i} type="button" disabled={isPast || isBooked || saving === ds}
                onClick={() => toggle(ds)}
                className={'aspect-square rounded-lg text-[13px] font-semibold grid place-items-center active:scale-95 disabled:active:scale-100 ' + cls}>
                {saving === ds ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : d}
              </button>
            );
          })}
        </div>
      )}
      <div className="flex items-center gap-4 mt-3 text-[11px] text-[#6A7585]">
        <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded bg-[#E7F6EC] border border-[#BFE6CD]" /> Libre</span>
        <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded bg-[#E7EAEE]" /> Bloqué</span>
        <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded bg-[#E5484D]" /> Réservé</span>
      </div>
      <p className="text-[11px] text-[#9DAAB7] mt-2">Touche un jour pour le bloquer/débloquer (entretien, usage perso). Les jours passés et réservés ne sont pas modifiables.</p>
    </div>
  );
}
