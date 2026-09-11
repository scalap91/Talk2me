'use client';
/**
 * MulticamEditor — éditeur multicam MANUEL web, miroir EXACT du natif (film_multicam_editor.dart).
 *
 * Doctrine (Pascal 2026-09-11) : les caméras d'un plan empilées, l'une au-dessus de l'autre, calées
 * pareil (départ commun « Action »), lecture SYNCHRONISÉE + un CROSS-FADER à la DJ (un bouton par
 * caméra) : taper une caméra la met « à l'antenne » et pose une bascule (coupe franche, une image à
 * la fois). On referme → POST /api/project/:id/multicam → le montage assemble la séquence alternée.
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import { filmApi, type FilmMulticamSegment } from '@/lib/film/api';

const CAM_COLORS = ['#FF7F11', '#2F6BFF', '#22C55E', '#9B59F6'];

export interface MulticamCamera { takeId: string; url: string; label: string }
interface Seg { cam: number; from: number; to: number }

export default function MulticamEditor({
  projectId, sceneId, shotId, shotLabel, cameras, initialSegments = [], onClose,
}: {
  projectId: string; sceneId: string; shotId: string; shotLabel: string;
  cameras: MulticamCamera[];
  initialSegments?: FilmMulticamSegment[];
  onClose: (saved: boolean) => void;
}) {
  const vids = useRef<(HTMLVideoElement | null)[]>([]);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [dur, setDur] = useState(0);         // fenêtre commune (min des durées)
  const [pos, setPos] = useState(0);         // tête de lecture commune
  const [active, setActive] = useState(0);   // caméra à l'antenne
  const segStart = useRef(0);
  const [segments, setSegments] = useState<Seg[]>(
    initialSegments
      .map((s) => ({ cam: cameras.findIndex((c) => c.takeId === s.takeId), from: s.fromSec, to: s.toSec }))
      .filter((s) => s.cam >= 0 && s.to > s.from),
  );
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);

  // Durée commune quand toutes les vidéos ont leurs métadonnées.
  const recomputeDur = useCallback(() => {
    let min = Infinity;
    for (const v of vids.current) { if (v && v.duration > 0 && v.duration < min) min = v.duration; }
    if (Number.isFinite(min)) { setDur(min); setReady(true); }
  }, []);

  useEffect(() => () => { if (tick.current) clearInterval(tick.current); }, []);

  const setAllVolume = useCallback((camOn: number) => {
    vids.current.forEach((v, i) => { if (v) v.muted = i !== camOn; });
  }, []);

  const seekAll = useCallback((sec: number) => {
    const t = Math.max(0, Math.min(sec, dur || 0));
    vids.current.forEach((v) => { if (v) v.currentTime = t; });
    setPos(t);
  }, [dur]);

  const pauseAll = useCallback(() => {
    vids.current.forEach((v) => v?.pause());
    if (tick.current) { clearInterval(tick.current); tick.current = null; }
    setPlaying(false);
  }, []);

  const closeTail = useCallback((end: number) => {
    if (end - segStart.current > 0.05) {
      setSegments((prev) => [...prev, { cam: active, from: segStart.current, to: end }]);
      segStart.current = end;
    }
  }, [active]);

  const resetRecording = useCallback(() => {
    setSegments([]); segStart.current = 0; setActive(0); setAllVolume(0);
  }, [setAllVolume]);

  const onTick = useCallback(() => {
    const master = vids.current[active];
    if (!master) return;
    const p = Math.min(master.currentTime, dur);
    setPos(p);
    vids.current.forEach((v, i) => { if (v && i !== active && Math.abs(v.currentTime - p) > 0.14) v.currentTime = p; });
    if (p >= dur - 0.05) { closeTail(dur); pauseAll(); }
  }, [active, dur, closeTail, pauseAll]);

  const playPause = useCallback(() => {
    if (!ready) return;
    if (playing) { pauseAll(); return; }
    if (pos >= dur - 0.05) { seekAll(0); resetRecording(); }
    setAllVolume(active);
    vids.current.forEach((v) => v?.play().catch(() => {}));
    setPlaying(true);
    if (tick.current) clearInterval(tick.current);
    tick.current = setInterval(onTick, 120);
  }, [ready, playing, pos, dur, active, pauseAll, seekAll, resetRecording, setAllVolume, onTick]);

  // Cross-fader : basculer pose une bascule à la position courante.
  const switchTo = useCallback((cam: number) => {
    if (cam === active) return;
    const t = pos;
    if (t - segStart.current > 0.05) setSegments((prev) => [...prev, { cam: active, from: segStart.current, to: t }]);
    segStart.current = t;
    setActive(cam);
    setAllVolume(cam);
  }, [active, pos, setAllVolume]);

  const restart = useCallback(() => { pauseAll(); seekAll(0); resetRecording(); }, [pauseAll, seekAll, resetRecording]);

  async function save() {
    const end = pos >= dur - 0.05 ? dur : pos;
    // Ferme le segment courant sans dépendre de l'async setState.
    const segs = [...segments];
    if (end - segStart.current > 0.05) segs.push({ cam: active, from: segStart.current, to: end });
    if (!segs.length) { setErr('Lis la séquence et bascule les caméras avant d’enregistrer'); return; }
    setSaving(true); setErr(null);
    const payload: FilmMulticamSegment[] = segs.map((s) => ({
      takeId: cameras[s.cam].takeId, fromSec: +s.from.toFixed(2), toSec: +s.to.toFixed(2),
    }));
    const { ok, status, d } = await filmApi.multicamEdit(projectId, sceneId, shotId, payload);
    setSaving(false);
    if (!ok) { setErr(d?.error || `HTTP ${status}`); return; }
    onClose(true);
  }

  const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

  // Piste de montage : segments + segment en cours.
  const track: Seg[] = [...segments];
  if (pos - segStart.current > 0.02) track.push({ cam: active, from: segStart.current, to: pos });
  const lastTo = track.length ? track[track.length - 1].to : 0;

  return (
    <div className="fixed inset-0 z-[200] flex flex-col" style={{ background: '#0C0E12' }}>
      {/* Barre du haut */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-[#1b2029]">
        <button type="button" onClick={() => onClose(false)} className="text-white/80 text-[22px] leading-none">×</button>
        <span className="text-white font-black text-[15px] truncate" style={{ fontFamily: "'Outfit',sans-serif" }}>Monter : {shotLabel}</span>
      </div>

      {/* Caméras empilées, calées. L'active est vive, les autres estompées. */}
      <div className="flex-1 overflow-y-auto px-3 pt-3">
        {cameras.map((c, i) => {
          const isActive = i === active;
          const color = CAM_COLORS[i % CAM_COLORS.length];
          return (
            <div key={c.takeId} onClick={() => switchTo(i)}
              className="relative mb-2.5 rounded-xl overflow-hidden cursor-pointer transition-all"
              style={{ border: `${isActive ? 3 : 1}px solid ${isActive ? color : '#232833'}` }}>
              <video
                ref={(el) => { vids.current[i] = el; }}
                src={c.url} playsInline preload="auto"
                onLoadedMetadata={recomputeDur}
                className="w-full bg-black mx-auto block"
                style={{ maxHeight: 220, objectFit: 'contain', opacity: isActive ? 1 : 0.45 }}
              />
              <span className="absolute top-2 left-2 px-2.5 py-1 rounded-full text-white text-[11.5px] font-extrabold"
                style={{ background: color, opacity: isActive ? 0.95 : 0.5 }}>
                {c.label}{isActive ? ' · à l’antenne' : ''}
              </span>
            </div>
          );
        })}
      </div>

      {/* Barre de temps + piste de montage colorée + scrub */}
      <div className="px-3 pt-2 pb-1">
        <div className="h-3 rounded-[5px] overflow-hidden flex" style={{ background: '#232833' }}>
          {dur > 0 && track.map((s, idx) => (
            <div key={idx} style={{ flex: Math.max(1, Math.round((s.to - s.from) * 1000)), background: CAM_COLORS[s.cam % CAM_COLORS.length] }} />
          ))}
          {dur > 0 && dur - lastTo > 0.02 && <div style={{ flex: Math.round((dur - lastTo) * 1000), background: '#232833' }} />}
        </div>
        <input type="range" min={0} max={dur || 1} step={0.01} value={Math.min(pos, dur || 1)}
          onChange={(e) => { if (playing) pauseAll(); seekAll(parseFloat(e.target.value)); }}
          className="w-full mt-2 accent-[#FF7F11]" />
        <div className="flex justify-between text-[11.5px]" style={{ color: '#6A7585' }}>
          <span>{fmt(pos)}</span><span>{fmt(dur)}</span>
        </div>
      </div>

      {/* Cross-fader + transport + enregistrer */}
      <div className="px-3 pt-1.5 pb-5" style={{ background: '#11141A' }}>
        {err && <p className="text-[#FF7A7A] text-[12.5px] mb-2">{err}</p>}
        <div className="flex gap-2">
          {cameras.map((c, i) => {
            const isActive = i === active;
            const color = CAM_COLORS[i % CAM_COLORS.length];
            return (
              <button type="button" key={c.takeId} onClick={() => switchTo(i)}
                className="flex-1 rounded-xl py-3.5 flex flex-col items-center gap-1 transition-all"
                style={{ background: isActive ? color : 'transparent', border: `2px solid ${color}`, color: isActive ? '#fff' : color }}>
                <span className="text-[18px] leading-none">🎥</span>
                <span className="font-extrabold text-[12.5px]">{c.label}</span>
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2 mt-2.5">
          <button type="button" onClick={playPause}
            className="w-11 h-11 rounded-full flex items-center justify-center text-white text-[22px]"
            style={{ background: '#FF7F11' }}>{playing ? '⏸' : '▶'}</button>
          <button type="button" onClick={restart}
            className="w-11 h-11 rounded-full flex items-center justify-center text-white text-[18px] border-2"
            style={{ borderColor: '#38404D' }}>↺</button>
          <div className="flex-1" />
          <button type="button" onClick={save} disabled={saving}
            className="rounded-xl px-4 py-3 text-white font-extrabold text-[14px] disabled:opacity-60"
            style={{ fontFamily: "'Outfit',sans-serif", background: '#22C55E' }}>
            {saving ? 'Enregistrement…' : '✓ Enregistrer le montage'}
          </button>
        </div>
        <p className="text-center text-[11.5px] mt-1.5" style={{ color: '#6A7585' }}>
          Lis la séquence et tape une caméra pour la mettre à l’antenne. Chaque bascule = une coupe.
        </p>
      </div>
    </div>
  );
}
