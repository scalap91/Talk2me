'use client';

/**
 * LOCAT👀 — feuille de réservation (calendrier). Ouverte au clic « Louer ».
 * Grille mois : jours indisponibles (bloqués/réservés) grisés ; on choisit une plage
 * (1er tap = début, 2e tap = fin). Total = durée × tarif (devis serveur). → POST /api/locat/book.
 */
import { useEffect, useMemo, useState } from 'react';

const iso = (d: Date) => d.toISOString().slice(0, 10);
const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const DOW = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

export default function LocatBookSheet({ itemId, title, onClose }: { itemId: string; title: string; onClose: () => void }) {
  const today = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);
  const [view, setView] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [unavail, setUnavail] = useState<Set<string>>(new Set());
  const [start, setStart] = useState<string | null>(null);
  const [end, setEnd] = useState<string | null>(null);
  const [quote, setQuote] = useState<{ total_label: string; days: number; periods: number; rate_unit: string; deposit: number } | null>(null);
  const [booking, setBooking] = useState(false);
  const [done, setDone] = useState<null | { total_label: string; days: number }>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    fetch(`/api/locat/availability?id=${encodeURIComponent(itemId)}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null)).then((d) => { if (d?.ok) setUnavail(new Set([...(d.blocked || []), ...(d.booked || [])])); }).catch(() => {});
  }, [itemId]);

  // Jours de la plage sélectionnée.
  const range = useMemo(() => {
    if (!start) return [] as string[];
    const a = new Date(start + 'T00:00:00Z'); const b = new Date((end || start) + 'T00:00:00Z');
    const out: string[] = [];
    for (let d = new Date(a), i = 0; d <= b && i < 90; d.setUTCDate(d.getUTCDate() + 1), i++) out.push(iso(d));
    return out;
  }, [start, end]);

  // Devis serveur quand la plage change (et complète).
  useEffect(() => {
    if (!start || !end) { setQuote(null); return; }
    fetch(`/api/locat/availability?id=${encodeURIComponent(itemId)}&dates=${range.join(',')}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null)).then((d) => {
        const q = d?.quote;
        if (q) { const total = q.totalCents; setQuote({ total_label: `${total.toLocaleString('fr-FR')} Ar`, days: range.length, periods: q.periods, rate_unit: q.rateUnit, deposit: q.deposit || 0 }); }
      }).catch(() => {});
  }, [start, end, range, itemId]);

  const tap = (day: string) => {
    if (unavail.has(day) || day < iso(today)) return;
    if (!start || (start && end)) { setStart(day); setEnd(null); setErr(''); return; }
    if (day < start) { setStart(day); return; }
    // vérifie qu'aucun jour indispo n'est dans la plage
    const a = new Date(start + 'T00:00:00Z'); const b = new Date(day + 'T00:00:00Z');
    for (let d = new Date(a); d <= b; d.setUTCDate(d.getUTCDate() + 1)) { if (unavail.has(iso(d))) { setErr('Un jour indisponible est dans ta plage.'); return; } }
    setEnd(day); setErr('');
  };

  const reserve = async () => {
    if (!range.length) return;
    setBooking(true); setErr('');
    try {
      const r = await fetch('/api/locat/book', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: itemId, dates: range }) });
      const d = await r.json();
      if (d?.ok) {
        if (d.checkout_url) { window.location.href = d.checkout_url; return; } // → page de paiement opérateur (PaPi)
        setDone({ total_label: Number(d.total || 0).toLocaleString('fr-FR') + ' Ar', days: d.days }); // payé depuis le wallet
      } else setErr(d?.error === 'dates_unavailable' ? 'Ces dates viennent d\'être prises.' : d?.error === 'self' ? 'C\'est ton propre bien.' : d?.error === 'seller_kyc_required' ? 'Le propriétaire n\'a pas encore vérifié son identité.' : 'Réservation impossible.');
    } catch { setErr('Erreur réseau'); } finally { setBooking(false); }
  };

  // Grille du mois affiché.
  const cells = useMemo(() => {
    const y = view.getFullYear(), m = view.getMonth();
    const first = new Date(y, m, 1);
    const startDow = (first.getDay() + 6) % 7; // Lundi=0
    const nDays = new Date(y, m + 1, 0).getDate();
    const arr: (string | null)[] = Array(startDow).fill(null);
    for (let d = 1; d <= nDays; d++) arr.push(iso(new Date(y, m, d)));
    return arr;
  }, [view]);

  const inRange = (day: string) => start && (day === start || (end && day > start && day <= end));
  const prevMonth = () => setView((v) => new Date(v.getFullYear(), v.getMonth() - 1, 1));
  const nextMonth = () => setView((v) => new Date(v.getFullYear(), v.getMonth() + 1, 1));
  const canPrev = view > new Date(today.getFullYear(), today.getMonth(), 1);

  return (
    <div onClick={onClose} className="fixed inset-0 z-[120] bg-black/40 flex items-end sm:items-center sm:justify-center">
      <div onClick={(e) => e.stopPropagation()} className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl p-4 pb-[calc(env(safe-area-inset-bottom)+16px)]">
        {done ? (
          <div className="text-center py-6">
            <div className="text-4xl mb-2">🔑</div>
            <div className="font-extrabold text-[18px] text-[var(--t2m-ink)]" style={{ fontFamily: "'Outfit',sans-serif" }}>Demande de location envoyée</div>
            <div className="text-[14px] text-[var(--t2m-ink-2)] mt-1">{done.days} jour(s) · {done.total_label}</div>
            <div className="text-[12.5px] text-[var(--t2m-ink-2)] mt-2">Le paiement protégé arrive à la prochaine étape.</div>
            <button onClick={onClose} className="mt-4 w-full py-3 rounded-xl bg-[var(--t2m-primary)] text-white font-bold">Fermer</button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-1">
              <div className="font-extrabold text-[16px] text-[var(--t2m-ink)] truncate pr-2" style={{ fontFamily: "'Outfit',sans-serif" }}>🔑 Louer · {title}</div>
              <button onClick={onClose} aria-label="Fermer" className="w-8 h-8 grid place-items-center text-[var(--t2m-ink-2)]">✕</button>
            </div>
            <div className="text-[12.5px] text-[var(--t2m-ink-2)] mb-2">Choisis tes dates (début puis fin).</div>

            {/* En-tête mois */}
            <div className="flex items-center justify-between mb-1">
              <button onClick={prevMonth} disabled={!canPrev} className="w-8 h-8 grid place-items-center rounded-full disabled:opacity-30 text-[var(--t2m-ink)]">‹</button>
              <div className="font-bold text-[14px] text-[var(--t2m-ink)] capitalize">{MONTHS[view.getMonth()]} {view.getFullYear()}</div>
              <button onClick={nextMonth} className="w-8 h-8 grid place-items-center rounded-full text-[var(--t2m-ink)]">›</button>
            </div>
            <div className="grid grid-cols-7 gap-1 mb-1">{DOW.map((d, i) => <div key={i} className="text-center text-[11px] text-[var(--t2m-ink-2)] font-semibold">{d}</div>)}</div>
            <div className="grid grid-cols-7 gap-1">
              {cells.map((day, i) => {
                if (!day) return <div key={i} />;
                const past = day < iso(today);
                const off = unavail.has(day) || past;
                const sel = inRange(day);
                return (
                  <button key={day} onClick={() => tap(day)} disabled={off}
                    className={'aspect-square rounded-lg text-[13px] font-semibold ' +
                      (sel ? 'bg-[var(--t2m-primary)] text-white' : off ? 'text-[var(--t2m-line)] line-through' : 'text-[var(--t2m-ink)] hover:bg-[var(--t2m-wash)]')}>
                    {Number(day.slice(8, 10))}
                  </button>
                );
              })}
            </div>

            {err && <div className="text-[13px] text-red-600 mt-2">{err}</div>}

            {/* Récap + réserver */}
            <div className="mt-3 flex items-center justify-between">
              <div className="text-[13px] text-[var(--t2m-ink-2)]">
                {quote ? <>
                  <b className="text-[var(--t2m-ink)]">{quote.total_label}</b> · {quote.days} j{quote.periods > 1 && quote.rate_unit !== 'jour' ? ` (${quote.periods}×/${quote.rate_unit})` : ''}
                  {quote.deposit > 0 && <span className="block text-[11.5px]">+ caution {quote.deposit.toLocaleString('fr-FR')} Ar (rendue au retour)</span>}
                </> : start && !end ? 'Choisis la date de fin' : 'Aucune date'}
              </div>
              <button onClick={reserve} disabled={!range.length || booking || (start !== null && end === null)} className="px-5 py-3 rounded-xl bg-[var(--t2m-primary)] text-white font-bold disabled:opacity-40">{booking ? '…' : 'Réserver'}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
