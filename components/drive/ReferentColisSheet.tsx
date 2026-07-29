'use client';

/**
 * Talk2Me — « Colis de ma zone » (Pascal 2026-07-28). Le contributeur RÉFÉRENT (parrain des
 * chauffeurs) suit les colis portés par SES chauffeurs, REJOUE la séquence sur la carte (là où
 * ça se perd / traîne) et APPELLE les 2 parties EN IN-APP (jamais le numéro), car il connaît
 * personnellement son chauffeur → on évite le pire. Il NE décide PAS du remboursement (gouvernance).
 * Données : GET /api/transport/referent-shipments (+ ?timeline=<id>).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import ColisReplayMap, { type ReplayPoint } from './ColisReplayMap';

type Person = { id: string; name: string } | null;
type Colis = { id: string; tracking: string; product_label: string | null; status: string; updated_at: number; flagged: boolean; seller: Person; buyer: Person; carrier: Person };
type Evt = { type: string; at: number; actor: Person; lat: number | null; lng: number | null; meta: unknown };
type Timeline = { shipment: { id: string; tracking: string; status: string; product_label: string | null; origin: { lat: number; lng: number; label?: string }; dest: { lat: number; lng: number; label?: string }; seller: Person; buyer: Person } | null; events: Evt[] };

const STALL_MS = 90 * 60 * 1000; // gap > 90 min entre 2 événements = « traîne »
const fmtTime = (ms: number) => new Date(ms).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
const STATUS_FR: Record<string, string> = { pending: 'En attente', picked: 'Récupéré', in_transit: 'En transit', at_hub: 'Au relais', out_for_delivery: 'En livraison', delivered: 'Livré', stalled: 'À l\'arrêt' };

async function callInApp(peer: Person) {
  if (!peer) return;
  try {
    const res = await fetch('/api/calls/new', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ callee_id: peer.id, kind: 'audio', layer: 'comm' }) });
    if (res.ok) { const j = await res.json(); if (j.call_id) window.dispatchEvent(new CustomEvent('ttm:call:start', { detail: { call_id: j.call_id, kind: 'audio', callee: j.callee } })); }
  } catch { /* silencieux */ }
}

export default function ReferentColisSheet({ onClose }: { onClose: () => void }) {
  const [list, setList] = useState<Colis[] | null>(null);
  const [sel, setSel] = useState<Colis | null>(null);
  const [tl, setTl] = useState<Timeline | null>(null);
  const [tlLoading, setTlLoading] = useState(false);
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    fetch('/api/transport/referent-shipments', { cache: 'no-store' })
      .then((r) => r.json()).then((d) => setList(d.shipments || [])).catch(() => setList([]));
  }, []);

  // Positions du trajet (événements géolocalisés) + détection « traîne » (gap long avant l'événement suivant).
  const points: ReplayPoint[] = useMemo(() => {
    if (!tl) return [];
    const geo = tl.events.filter((e) => typeof e.lat === 'number' && typeof e.lng === 'number');
    return geo.map((e, i) => {
      const next = geo[i + 1];
      const stalled = !!next && next.at - e.at > STALL_MS;
      return { lat: e.lat as number, lng: e.lng as number, label: `${STATUS_FR[e.type] || e.type} · ${fmtTime(e.at)}`, stalled };
    });
  }, [tl]);

  const openReplay = async (c: Colis) => {
    setSel(c); setTl(null); setIdx(0); setPlaying(false); setTlLoading(true);
    try {
      const d = await fetch(`/api/transport/referent-shipments?timeline=${encodeURIComponent(c.id)}`, { cache: 'no-store' }).then((r) => r.json());
      setTl(d.timeline || { shipment: null, events: [] });
    } catch { setTl({ shipment: null, events: [] }); }
    setTlLoading(false);
  };

  // Lecture animée du trajet
  useEffect(() => {
    if (timer.current) { clearInterval(timer.current); timer.current = null; }
    if (playing && points.length) {
      timer.current = setInterval(() => {
        setIdx((i) => { if (i >= points.length - 1) { setPlaying(false); return i; } return i + 1; });
      }, 900);
    }
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [playing, points.length]);

  return (
    <div className="fixed inset-0 z-[70] bg-[#0d0f12] text-white flex flex-col" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
      <header className="flex items-center gap-3 px-4 py-3 border-b border-white/10">
        <button onClick={() => (sel ? setSel(null) : onClose())} className="text-white/70 text-2xl leading-none w-8">←</button>
        <div className="flex-1">
          <div className="font-semibold text-[15px]">{sel ? 'Rejouer le colis' : 'Colis de ma zone'}</div>
          <div className="text-white/50 text-[12px]">{sel ? sel.tracking : 'Colis portés par tes chauffeurs'}</div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-4" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 24px)' }}>
        {/* ── LISTE ── */}
        {!sel && (
          <>
            {list === null && <div className="text-white/50 text-sm py-10 text-center">Chargement…</div>}
            {list && list.length === 0 && (
              <div className="text-white/50 text-sm py-10 text-center">Aucun colis en cours porté par tes chauffeurs.</div>
            )}
            {list && list.map((c) => (
              <div key={c.id} className="mb-3 rounded-2xl border border-white/10 bg-white/[0.04] p-3.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-semibold text-[14px] truncate">{c.product_label || 'Colis'}</div>
                    <div className="text-white/50 text-[12px]">{c.tracking} · {c.carrier?.name || '—'}</div>
                  </div>
                  <span className={`shrink-0 text-[11px] font-semibold px-2 py-1 rounded-full ${c.flagged ? 'bg-red-500/15 text-red-400' : 'bg-white/10 text-white/70'}`}>
                    {c.flagged ? '⚠ À l\'arrêt' : (STATUS_FR[c.status] || c.status)}
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  <button onClick={() => openReplay(c)} className="rounded-xl bg-[#ff7f11] text-black text-[13px] font-semibold py-2">Rejouer</button>
                  <button onClick={() => callInApp(c.buyer)} disabled={!c.buyer} className="rounded-xl border border-white/15 text-[13px] py-2 disabled:opacity-40">📞 Client</button>
                  <button onClick={() => callInApp(c.carrier)} disabled={!c.carrier} className="rounded-xl border border-white/15 text-[13px] py-2 disabled:opacity-40">📞 Chauffeur</button>
                </div>
              </div>
            ))}
          </>
        )}

        {/* ── REJEU ── */}
        {sel && (
          <>
            {tlLoading && <div className="text-white/50 text-sm py-10 text-center">Chargement du trajet…</div>}
            {tl && (
              <>
                <ColisReplayMap origin={tl.shipment?.origin} dest={tl.shipment?.dest} points={points} activeIdx={idx} />

                {/* scrubber lecture */}
                {points.length > 0 ? (
                  <div className="mt-3 rounded-2xl border border-white/10 bg-white/[0.04] p-3">
                    <div className="flex items-center gap-3">
                      <button onClick={() => setPlaying((p) => !p)} className="rounded-full bg-[#ff7f11] text-black w-10 h-10 text-lg font-bold shrink-0">{playing ? '⏸' : '▶'}</button>
                      <input type="range" min={0} max={points.length - 1} value={idx} onChange={(e) => { setPlaying(false); setIdx(Number(e.target.value)); }} className="flex-1 accent-[#ff7f11]" />
                      <span className="text-white/60 text-[12px] shrink-0 tabular-nums">{idx + 1}/{points.length}</span>
                    </div>
                    <div className="mt-2 text-[13px]">
                      <span className="text-white/80">{points[idx]?.label}</span>
                      {points[idx]?.stalled && <span className="ml-2 text-red-400 font-semibold">· traîne ici</span>}
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 text-white/50 text-[13px] text-center py-4">Pas encore de position géolocalisée sur ce colis.</div>
                )}

                {/* appels + note gouvernance */}
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button onClick={() => callInApp(tl.shipment?.buyer || sel.buyer)} className="rounded-xl border border-white/15 text-[13px] py-2.5">📞 Appeler le client</button>
                  <button onClick={() => callInApp(sel.carrier)} className="rounded-xl border border-white/15 text-[13px] py-2.5">📞 Appeler le chauffeur</button>
                </div>

                {/* journal complet des événements (repère les délais) */}
                <div className="mt-4">
                  <div className="text-white/40 text-[11px] uppercase tracking-wide mb-2">Journal</div>
                  {tl.events.map((e, i) => {
                    const next = tl.events[i + 1];
                    const gap = next ? next.at - e.at : 0;
                    const longGap = gap > STALL_MS;
                    return (
                      <div key={i} className="flex items-start gap-2 py-1.5 border-b border-white/5 text-[13px]">
                        <span className="text-white/40 shrink-0 w-24 tabular-nums">{fmtTime(e.at)}</span>
                        <span className="flex-1">{STATUS_FR[e.type] || e.type}{e.actor ? ` · ${e.actor.name}` : ''}
                          {longGap && <span className="text-red-400"> — puis {Math.round(gap / 60000)} min sans mouvement</span>}
                        </span>
                      </div>
                    );
                  })}
                </div>

                <p className="mt-4 text-white/40 text-[12px] leading-relaxed">
                  Tu suis et tu appelles pour désamorcer. Le <strong className="text-white/60">remboursement en cas de litige</strong> relève de la gouvernance (chef instruit → validateur décide), pas de toi.
                </p>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
