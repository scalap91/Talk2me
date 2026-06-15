'use client';

/* eslint-disable @next/next/no-img-element */
/**
 * Talk2Me — Radar de proximité (Pascal 2026-06-15).
 * Preuve visuelle que la géoloc 500 m marche : on récupère ta position, on scanne
 * les plats maison + restos autour, et on les affiche en BLIPS sur un radar
 * (anneaux 1/3 · 2/3 · rayon, balayage animé) + une liste « détectés ». Monochrome.
 */

import { useEffect, useRef, useState } from 'react';
import { X, Loader2, MapPin } from 'lucide-react';
import BoutiqueSheet from './BoutiqueSheet';

interface Blip { kind: 'plat' | 'resto'; id: string; key: string; name: string; lat: number | null; lng: number | null; dist_m: number; items_count: number }

const SIZE = 300, C = SIZE / 2, MAXR = C - 18;

function bearingRad(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const φ1 = toRad(lat1), φ2 = toRad(lat2), Δλ = toRad(lng2 - lng1);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return Math.atan2(y, x); // 0 = Nord
}

export default function RadarSheet({ onClose, radius = 500 }: { onClose: () => void; radius?: number }) {
  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(null);
  const [items, setItems] = useState<Blip[]>([]);
  const [phase, setPhase] = useState<'geo' | 'scan' | 'done' | 'nogeo'>('geo');
  const [openKey, setOpenKey] = useState<string | null>(null);
  const triedRef = useRef(false);

  useEffect(() => {
    if (triedRef.current) return; triedRef.current = true;
    if (typeof navigator === 'undefined' || !navigator.geolocation) { setPhase('nogeo'); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const here = { lat: p.coords.latitude, lng: p.coords.longitude };
        setPos(here); setPhase('scan');
        fetch(`/api/radar?lat=${here.lat}&lng=${here.lng}&radius=${radius}`, { cache: 'no-store' })
          .then((r) => r.json())
          .then((d) => { if (d?.ok) setItems(d.items || []); })
          .catch(() => {})
          .finally(() => setPhase('done'));
      },
      () => setPhase('nogeo'),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }, [radius]);

  const blipXY = (b: Blip) => {
    if (!pos || b.lat == null || b.lng == null) return { x: C, y: C };
    const θ = bearingRad(pos.lat, pos.lng, b.lat, b.lng);
    const r = Math.min(1, b.dist_m / radius) * MAXR;
    return { x: C + r * Math.sin(θ), y: C - r * Math.cos(θ) };
  };

  const ringLabel = (frac: number) => `${Math.round((radius * frac) / 10) * 10} m`;

  return (
    <div className="fixed inset-0 z-[80] bg-black/85 backdrop-blur-sm flex flex-col" onClick={onClose}>
      <div className="flex items-center justify-between px-4 pt-[calc(env(safe-area-inset-top)+0.6rem)] pb-2" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-white text-[16px] font-bold flex items-center gap-2"><MapPin className="w-4 h-4 text-white/70" /> Radar · {radius} m</h2>
        <button onClick={onClose} className="w-9 h-9 rounded-full bg-white/10 grid place-items-center text-white/80"><X className="w-5 h-5" /></button>
      </div>

      <div className="flex-1 flex flex-col items-center justify-start overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        {/* RADAR */}
        <div className="relative mt-3" style={{ width: SIZE, height: SIZE }}>
          {[1, 0.66, 0.33].map((f) => (
            <div key={f} className="absolute rounded-full border border-white/15" style={{ width: 2 * MAXR * f, height: 2 * MAXR * f, left: C - MAXR * f, top: C - MAXR * f }} />
          ))}
          {/* croix */}
          <div className="absolute bg-white/10" style={{ left: C, top: C - MAXR, width: 1, height: 2 * MAXR }} />
          <div className="absolute bg-white/10" style={{ top: C, left: C - MAXR, height: 1, width: 2 * MAXR }} />
          {/* balayage */}
          {phase !== 'done' || items.length >= 0 ? (
            <div className="absolute rounded-full radar-sweep" style={{ width: 2 * MAXR, height: 2 * MAXR, left: C - MAXR, top: C - MAXR, background: 'conic-gradient(from 0deg, rgba(255,255,255,.22), transparent 60deg)' }} />
          ) : null}
          {/* labels anneaux */}
          {[0.33, 0.66, 1].map((f) => (
            <span key={f} className="absolute text-[9px] text-white/35" style={{ left: C + 3, top: C - MAXR * f - 2 }}>{ringLabel(f)}</span>
          ))}
          {/* centre = moi */}
          <div className="absolute rounded-full bg-white" style={{ width: 10, height: 10, left: C - 5, top: C - 5, boxShadow: '0 0 10px rgba(255,255,255,.8)' }} />
          {/* blips */}
          {phase === 'done' && items.map((b) => {
            const { x, y } = blipXY(b);
            return (
              <button key={b.id} onClick={() => setOpenKey(b.key)} className="absolute -translate-x-1/2 -translate-y-1/2 active:scale-90" style={{ left: x, top: y }}>
                <span className={'block rounded-full ' + (b.kind === 'plat' ? 'bg-white' : 'bg-white/55')} style={{ width: 12, height: 12, boxShadow: '0 0 8px rgba(255,255,255,.6)' }} />
              </button>
            );
          })}
        </div>

        {/* STATUT */}
        <div className="mt-3 text-center px-6">
          {phase === 'geo' && <p className="text-white/70 text-[13px] flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Localisation…</p>}
          {phase === 'scan' && <p className="text-white/70 text-[13px] flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Scan autour de toi…</p>}
          {phase === 'nogeo' && <p className="text-white/60 text-[13px]">Position indisponible — autorise la localisation pour scanner.</p>}
          {phase === 'done' && (
            <p className="text-white text-[14px] font-semibold">{items.length > 0 ? `${items.length} détecté${items.length > 1 ? 's' : ''} dans ${radius} m` : `Rien dans ${radius} m`}</p>
          )}
          {phase === 'done' && pos && <p className="text-white/40 text-[11px] mt-0.5">ta position : {pos.lat.toFixed(4)}, {pos.lng.toFixed(4)}</p>}
        </div>

        {/* LISTE des détections */}
        {phase === 'done' && items.length > 0 && (
          <div className="w-full max-w-md px-4 mt-3 pb-6 space-y-2">
            {items.map((b) => (
              <button key={b.id} onClick={() => setOpenKey(b.key)} className="w-full flex items-center gap-3 bg-white/[0.05] border border-white/10 rounded-xl px-3 py-2.5 text-left active:scale-[0.99]">
                <span className={'shrink-0 rounded-full ' + (b.kind === 'plat' ? 'bg-white' : 'bg-white/55')} style={{ width: 10, height: 10 }} />
                <div className="flex-1 min-w-0">
                  <div className="text-white text-[14px] font-medium truncate">{b.name}</div>
                  <div className="text-white/45 text-[12px]">{b.kind === 'plat' ? 'Plat maison' : 'Restaurant'} · {b.items_count} article{b.items_count > 1 ? 's' : ''}</div>
                </div>
                <span className="text-white/70 text-[13px] font-semibold">{b.dist_m < 1000 ? b.dist_m + ' m' : (b.dist_m / 1000).toFixed(1) + ' km'}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {openKey && <BoutiqueSheet shopKey={openKey} onClose={() => setOpenKey(null)} />}
      <style>{`@keyframes radar-spin{to{transform:rotate(360deg)}} .radar-sweep{animation:radar-spin 3.2s linear infinite;transform-origin:center}`}</style>
    </div>
  );
}
