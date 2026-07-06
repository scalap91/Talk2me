'use client';

/* eslint-disable @next/next/no-img-element */
/**
 * Talk2Me — Louer un véhicule (Pascal 2026-06-26, Phase 2).
 * Liste des véhicules en location → tap → CALENDRIER de dispo → choix des dates →
 * Réserver (demande au propriétaire) ou Contacter. Caution/litiges hors Talk2Me.
 */
import { useEffect, useState, useCallback } from 'react';
import { X, Car, MapPin, Loader2, UserCheck, ChevronLeft, ChevronRight, CalendarCheck, Clock } from '@/lib/icons';
import MobilePayAuthModal from '@/components/pay/MobilePayAuthModal';
import PaymentFrame from '@/components/pay/PaymentFrame';

interface Vehicle {
  id: string; title: string; description: string | null;
  price_label: string | null; city: string | null; image_url: string | null;
  driver_option: string | null;
  seller: { username: string; display_name: string | null } | null;
}
const MONTHS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
const WD = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
function driverLabel(o: string | null): string {
  return o === 'with' ? 'Avec chauffeur' : o === 'without' ? 'Sans chauffeur' : o === 'both' ? 'Avec ou sans chauffeur' : 'Location';
}
/** Jours 'YYYY-MM-DD' d'une plage CONTINUE start→end inclus (garde-fou 90 j). */
function eachDate(start: string, end: string): string[] {
  const out: string[] = [];
  const s = new Date(start + 'T00:00:00Z').getTime(), e = new Date(end + 'T00:00:00Z').getTime();
  if (!(e >= s)) return out;
  for (let t = s; t <= e && out.length < 90; t += 86400000) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}
export default function RentalSheet({ onClose, vehicleId, directItem, propertyMode }: { onClose: () => void; vehicleId?: string; directItem?: Vehicle; propertyMode?: boolean }) {
  const [items, setItems] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [sel, setSel] = useState<Vehicle | null>(null);
  const [unavail, setUnavail] = useState<Set<string>>(new Set());
  const [start, setStart] = useState<string | null>(null);  // jour de prise
  const [end, setEnd] = useState<string | null>(null);      // jour de retour (plage CONTINUE)
  const [pickupTime, setPickupTime] = useState('');         // 'HH:MM' (retour = même heure)
  const [timePopup, setTimePopup] = useState(false);
  const [busy, setBusy] = useState(false);
  const [payAuthId, setPayAuthId] = useState<string | null>(null); // step-up validation mobile (desktop)
  const [payUrl, setPayUrl] = useState<string | null>(null);   // page PaPi affichée DANS l'app (iframe)
  const [payIntent, setPayIntent] = useState<string | null>(null);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const [ym, setYm] = useState({ y: today.getFullYear(), m: today.getMonth() });

  useEffect(() => {
    fetch('/api/drive/rentals', { cache: 'no-store' })
      .then((r) => r.json()).then((d) => { if (d?.ok) setItems(d.vehicles || []); })
      .catch(() => {}).finally(() => setLoading(false));
  }, []);

  const openVehicle = useCallback((v: Vehicle) => {
    setSel(v); setStart(null); setEnd(null); setPickupTime(''); setTimePopup(false); setUnavail(new Set()); setPayUrl(null); setPayIntent(null);
    setYm({ y: today.getFullYear(), m: today.getMonth() });
    fetch(`/api/drive/availability?id=${encodeURIComponent(v.id)}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => { if (d?.ok) setUnavail(new Set([...(d.blocked || []), ...(d.booked || [])])); })
      .catch(() => {});
  }, [today]);

  // Ouverture directe depuis une annonce → calendrier. directItem (ex. logement) est
  // fourni tel quel quand l'annonce n'est PAS dans la liste véhicules (immobilier).
  useEffect(() => {
    if (sel) return;
    if (directItem) { openVehicle(directItem); return; }
    if (!vehicleId || !items.length) return;
    const v = items.find((x) => x.id === vehicleId);
    if (v) openVehicle(v);
  }, [vehicleId, items, sel, openVehicle, directItem]);

  const fmt = (d: number) => `${ym.y}-${String(ym.m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const shiftMonth = (delta: number) => setYm((p) => { const nm = p.m + delta; return { y: p.y + Math.floor(nm / 12) - (nm < 0 ? 1 : 0), m: ((nm % 12) + 12) % 12 }; });

  // Plage CONTINUE : 1er clic = jour de prise (→ popup heure). 2e clic = jour de retour.
  const pick = (ds: string) => {
    if (unavail.has(ds)) return;
    if (!start || (start && end)) { setStart(ds); setEnd(null); setTimePopup(true); return; } // 1er clic → heure
    if (ds < start) { setStart(ds); setEnd(null); setTimePopup(true); return; }
    if (eachDate(start, ds).some((d) => unavail.has(d))) { setStart(ds); setEnd(null); setTimePopup(true); return; }
    setEnd(ds);
  };

  const dateList = start ? eachDate(start, end || start) : [];
  const days = dateList.length;

  // Réserver → PaPi (page de paiement affichée DANS l'app, en modal iframe).
  const pay = async (authId?: string) => {
    if (!sel || days === 0 || !pickupTime || busy) return;
    setBusy(true);
    try {
      const d = await fetch('/api/drive/rentals/book', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: sel.id, dates: dateList, pickup_time: pickupTime, pay_auth_id: authId }),
      }).then((x) => x.json());
      // STEP-UP : réservation depuis un ordinateur → validation sur le mobile d'abord.
      if (d?.needs_mobile_auth) { setPayAuthId(d.auth_id); return; }
      if (!d?.ok) {
        alert(d?.error === 'dates_unavailable' ? 'Ces dates ne sont plus disponibles.' : 'Paiement impossible, réessaie.');
        return;
      }
      if (d.checkout_url) { setPayIntent(d.intent_id || null); setPayUrl(d.checkout_url); return; }
      alert('✅ Réservé.'); onClose();
    } finally { setBusy(false); }
  };

  // Après fermeture du paiement : on vérifie si c'est payé (callback PaPi) puis on confirme.
  const closePay = async () => {
    const intent = payIntent;
    setPayUrl(null); setPayIntent(null);
    if (!intent) return;
    try {
      const s = await fetch(`/api/wallet/topup/status?intent=${encodeURIComponent(intent)}`, { cache: 'no-store' }).then((r) => r.json());
      if (s?.status === 'paid') { alert('✅ Paiement confirmé — réservé.'); onClose(); }
    } catch { /* */ }
  };

  const first = new Date(ym.y, ym.m, 1);
  const startWd = (first.getDay() + 6) % 7;
  const nbDays = new Date(ym.y, ym.m + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(startWd).fill(null), ...Array.from({ length: nbDays }, (_, i) => i + 1)];

  return (
    <div className="fixed inset-0 z-[80] bg-black/70 backdrop-blur-sm flex items-end lg:items-center lg:justify-center lg:p-6" onClick={onClose}>
      <div className="w-full lg:max-w-md lg:mx-auto max-h-[90dvh] lg:max-h-[88vh] overflow-y-auto bg-[#101015] rounded-t-3xl lg:rounded-3xl border-t lg:border border-white/10 p-4 lg:p-5 pb-[calc(env(safe-area-inset-bottom)+1rem)]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-white font-semibold text-[16px] inline-flex items-center gap-2">
            {sel ? <button onClick={() => setSel(null)} className="text-white/70"><ChevronLeft className="w-5 h-5" /></button> : <Car className="w-5 h-5 text-white/80" />}
            {sel ? sel.title : (propertyMode ? 'Louer un logement' : 'Louer un véhicule')}
          </h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/10 grid place-items-center text-white/80"><X className="w-4 h-4" /></button>
        </div>

        <p className="text-[11px] text-amber-200/85 bg-amber-500/10 border border-amber-400/20 rounded-lg px-3 py-2 mb-3 leading-snug">
          ⚠️ Talk2Me ne gère <b>ni la caution ni les litiges</b>. La caution et tout désaccord se règlent <b>directement entre le loueur et le locataire</b>.
        </p>

        {!sel ? (
          loading ? (
            <div className="py-16 grid place-items-center text-white/40"><Loader2 className="w-6 h-6 animate-spin" /></div>
          ) : items.length === 0 ? (
            <div className="py-14 text-center px-6">
              <Car className="w-8 h-8 text-white/25 mx-auto mb-3" strokeWidth={1.6} />
              <p className="text-white/60 text-[14px] font-medium">Aucun véhicule en location pour l&apos;instant.</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {items.map((v) => (
                <button key={v.id} onClick={() => openVehicle(v)} className="w-full flex gap-3 bg-white/[0.05] border border-white/10 rounded-xl p-2.5 text-left active:scale-[0.99]">
                  <div className="w-20 h-20 rounded-lg bg-black/30 overflow-hidden shrink-0">
                    {v.image_url ? <img src={v.image_url} alt="" className="w-full h-full object-cover" /> : <span className="w-full h-full grid place-items-center text-white/30"><Car className="w-7 h-7" /></span>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-white text-[14px] font-semibold truncate">{v.title}</div>
                    <div className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-emerald-200 bg-emerald-500/15 border border-emerald-400/25 rounded-full px-2 py-0.5"><UserCheck className="w-3 h-3" /> {driverLabel(v.driver_option)}</div>
                    <div className="text-white/70 text-[12.5px] mt-1">{v.price_label ? <b className="text-white">{v.price_label} / jour</b> : 'Prix à convenir'}{v.city ? <span className="text-white/45"> · {v.city}</span> : null}</div>
                    <div className="text-emerald-300 text-[11px] mt-1">Voir le calendrier → réserver</div>
                  </div>
                </button>
              ))}
            </div>
          )
        ) : (
          <div>
            <div className="text-white/70 text-[13px] mb-2">{sel.price_label ? <b className="text-white">{sel.price_label} / jour</b> : 'Prix à convenir'} · {driverLabel(sel.driver_option)}</div>
            <div className="flex items-center justify-between mb-2">
              <button onClick={() => shiftMonth(-1)} className="w-9 h-9 rounded-full bg-white/10 grid place-items-center text-white/80"><ChevronLeft className="w-5 h-5" /></button>
              <span className="text-white font-semibold text-[15px]">{MONTHS[ym.m]} {ym.y}</span>
              <button onClick={() => shiftMonth(1)} className="w-9 h-9 rounded-full bg-white/10 grid place-items-center text-white/80"><ChevronRight className="w-5 h-5" /></button>
            </div>
            <div className="grid grid-cols-7 gap-1 mb-1">{WD.map((d, i) => <div key={i} className="text-center text-[11px] text-white/35 py-1">{d}</div>)}</div>
            <div className="grid grid-cols-7 gap-1">
              {cells.map((d, i) => {
                if (d === null) return <div key={i} />;
                const ds = fmt(d);
                const dayDate = new Date(ym.y, ym.m, d); dayDate.setHours(0, 0, 0, 0);
                const isPast = dayDate < today;
                const isUnavail = unavail.has(ds);
                const isEdge = ds === start || ds === end;
                const inRange = start ? dateList.includes(ds) : false;
                const cls = isPast || isUnavail ? 'bg-white/[0.03] text-white/20 line-through'
                  : isEdge ? 'bg-red-600 text-white'
                  : inRange ? 'bg-red-500/40 text-white'
                  : 'bg-emerald-500/15 text-emerald-100 border border-emerald-400/25';
                return (
                  <button key={i} disabled={isPast || isUnavail} onClick={() => pick(ds)}
                    className={'aspect-square rounded-lg text-[13px] font-medium grid place-items-center active:scale-95 disabled:active:scale-100 ' + cls}>{d}</button>
                );
              })}
            </div>
            <p className="text-[11px] text-white/40 mt-2">
              {start
                ? <>Du <b className="text-white">{start}</b>{pickupTime ? <> à <b className="text-white">{pickupTime}</b></> : ''} au <b className="text-white">{end || start}</b>{pickupTime ? <> à <b className="text-white">{pickupTime}</b></> : ''} · <b className="text-white">{days} j</b>. Retour à la même heure (plus tôt OK, plus tard = pénalité).</>
                : 'Touche le 1er jour : on te demande l’heure de prise. Puis touche le dernier jour (plage continue).'}
            </p>
            {start && (
              <button onClick={() => setTimePopup(true)} className="mt-2 inline-flex items-center gap-1.5 text-[12px] text-emerald-300 underline">
                <Clock className="w-3.5 h-3.5" /> {pickupTime ? `Heure de prise : ${pickupTime} (modifier)` : 'Choisir l’heure de prise'}
              </button>
            )}

            <button onClick={() => pay()} disabled={days === 0 || !pickupTime || busy}
              className="w-full mt-3 py-3 rounded-xl bg-emerald-500 text-black text-[15px] font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-40 active:scale-[0.99]">
              {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <CalendarCheck className="w-5 h-5" />} Réserver & payer{days ? ` (${days} j)` : ''}
            </button>
            <p className="text-white/45 text-[11px] text-center mt-1.5">Paiement Mobile Money (MVola/Orange/Airtel) <b>dans l&apos;app</b>. Règlement versé au propriétaire <b>jour par jour</b> dès la récupération.</p>
            {sel.city && <p className="text-[11px] text-white/35 mt-2 inline-flex items-center gap-1"><MapPin className="w-3.5 h-3.5" /> {sel.city}</p>}
          </div>
        )}
      </div>

      {/* Step-up : validation mobile avant le paiement (réservation depuis un PC). */}
      {payAuthId && <MobilePayAuthModal authId={payAuthId} onApproved={(id) => { setPayAuthId(null); pay(id); }} onClose={() => setPayAuthId(null)} />}

      {/* 1er clic sur une date → on demande l'HEURE DE PRISE (retour = même heure). */}
      {timePopup && (
        <div className="fixed inset-0 z-[88] bg-black/70 flex items-center justify-center p-5" onClick={(e) => { e.stopPropagation(); setTimePopup(false); }}>
          <div className="w-full max-w-xs bg-[#16161c] border border-white/12 rounded-2xl p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-white font-semibold text-[15px] inline-flex items-center gap-2 mb-1"><Clock className="w-4.5 h-4.5 text-emerald-300" /> {propertyMode ? 'Heure d’arrivée (check-in)' : 'Heure de prise du véhicule'}</h3>
            <p className="text-white/45 text-[11.5px] mb-3 leading-snug">{propertyMode ? <>Tu arrives à cette heure. <b className="text-white/70">Le départ se fait à la même heure</b> le dernier jour.</> : <>Tu récupères le véhicule à cette heure. <b className="text-white/70">Le retour se fait à la même heure</b> le dernier jour (plus tôt OK, plus tard = pénalité).</>}</p>
            <input type="time" value={pickupTime} onChange={(e) => setPickupTime(e.target.value)}
              className="w-full bg-black/40 border border-white/15 rounded-xl px-3 py-3 text-white text-[16px] mb-3 [color-scheme:dark]" />
            <div className="grid grid-cols-4 gap-1.5 mb-4">
              {['08:00', '09:00', '10:00', '12:00', '14:00', '16:00', '18:00', '20:00'].map((t) => (
                <button key={t} onClick={() => setPickupTime(t)}
                  className={'py-1.5 rounded-lg text-[12px] font-medium ' + (pickupTime === t ? 'bg-emerald-500 text-black' : 'bg-white/8 text-white/70')}>{t}</button>
              ))}
            </div>
            <button onClick={() => setTimePopup(false)} disabled={!pickupTime}
              className="w-full py-2.5 rounded-xl bg-emerald-500 text-black font-semibold text-[14px] disabled:opacity-40">
              Valider l’heure
            </button>
          </div>
        </div>
      )}

      {/* Paiement PaPi DANS l'app — cadre brandé Talk2Me (page PaPi externe à l'intérieur). */}
      {payUrl && <PaymentFrame url={payUrl} onClose={closePay} />}
    </div>
  );
}
