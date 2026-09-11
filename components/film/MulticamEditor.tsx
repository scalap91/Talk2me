'use client';
/**
 * MulticamEditor — banc de montage multicam MANUEL à 2 pistes (Pascal 2026-09-11, modèle « coupe = bascule »).
 *
 * La prise ENTIÈRE cam1 au-dessus, cam2 en dessous, calées, BONNE ORIENTATION (bouton pivoter).
 * En dessous, une TIMELINE : on choisit la caméra de DÉPART, puis chaque COUPE posée = un BASCULEMENT
 * (fin de la caméra en cours + début de l'autre) → les sections ALTERNENT automatiquement. On glisse
 * une coupe pour la TRIMER (déplacer le point de bascule), on en ajoute / on en enlève. Résultat =
 * séquence alternée propre. Le serveur assemble la liste de segments {takeId, fromSec, toSec} (inchangé).
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import { filmApi, type FilmMulticamSegment } from '@/lib/film/api';

const CAM = [{ solid: '#FF7F11', name: 'Caméra 1' }, { solid: '#2F6BFF', name: 'Caméra 2' }];

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
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [dur, setDur] = useState(0);
  const [pos, setPos] = useState(0);
  const [rot, setRot] = useState<number[]>(cameras.map(() => 0));
  // LE MODÈLE : caméra de départ + points de coupe (bascule à chaque coupe).
  const [startCam, setStartCam] = useState(0);
  const [cuts, setCuts] = useState<number[]>([]);
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);
  const dragging = useRef<number | null>(null);

  // Segments dérivés : entre les coupes, la caméra alterne depuis startCam.
  const segments: Seg[] = (() => {
    const b = [0, ...cuts.slice().sort((a, z) => a - z), dur].filter((v, i, a) => i === 0 || v > a[i - 1] + 0.001);
    const out: Seg[] = [];
    for (let i = 0; i < b.length - 1; i++) out.push({ cam: (i + startCam) % 2, from: b[i], to: b[i + 1] });
    return out;
  })();

  const seed = useCallback((d: number) => {
    // Reprend un montage existant en points de coupe (+ déduit la caméra de départ).
    const segs = initialSegments
      .map((s) => ({ cam: Math.max(0, cameras.findIndex((c) => c.takeId === s.takeId)), from: s.fromSec, to: s.toSec }))
      .filter((s) => s.to > s.from)
      .sort((a, z) => a.from - z.from);
    if (segs.length) {
      setStartCam(segs[0].cam);
      setCuts(segs.slice(1).map((s) => s.from));
    }
  }, [initialSegments, cameras]);

  const recomputeDur = useCallback(() => {
    let min = Infinity;
    for (const v of vids.current) { if (v && v.duration > 0 && v.duration < min) min = v.duration; }
    if (Number.isFinite(min) && !ready) { setDur(min); seed(min); setReady(true); }
  }, [ready, seed]);

  useEffect(() => () => { if (tick.current) clearInterval(tick.current); }, []);

  // AUTO-ENREGISTREMENT (Pascal 2026-09-11) : la découpe PERSISTE sans cliquer « Enregistrer ».
  // Chaque changement de coupe/caméra de départ est sauvegardé en fond (débounce) → si on quitte et
  // qu'on revient, la dernière position est là. « Enregistrer » ne sert plus qu'à remonter le film.
  const seeded = useRef(false);
  useEffect(() => {
    if (!ready) return;
    if (!seeded.current) { seeded.current = true; return; } // ne pas ré-sauver l'état initial rechargé
    const id = setTimeout(() => {
      const clean = segments.filter((s) => s.to - s.from >= 0.05);
      const payload: FilmMulticamSegment[] = clean.map((s) => ({ takeId: cameras[s.cam].takeId, fromSec: +s.from.toFixed(2), toSec: +s.to.toFixed(2) }));
      filmApi.multicamEdit(projectId, sceneId, shotId, payload).catch(() => {});
    }, 600);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cuts, startCam, ready]);

  const camAt = useCallback((t: number) => {
    for (const s of segments) if (t >= s.from && t < s.to) return s.cam;
    return segments.length ? segments[segments.length - 1].cam : startCam;
  }, [segments, startCam]);

  const seekAll = useCallback((t: number) => {
    const c = Math.max(0, Math.min(t, dur || 0));
    vids.current.forEach((v) => { if (v) v.currentTime = c; });
    setPos(c);
  }, [dur]);

  const pauseAll = useCallback(() => {
    vids.current.forEach((v) => v?.pause());
    if (tick.current) { clearInterval(tick.current); tick.current = null; }
    setPlaying(false);
  }, []);

  const onTick = useCallback(() => {
    const master = vids.current[0];
    if (!master) return;
    const p = Math.min(master.currentTime, dur);
    setPos(p);
    const cam = camAt(p);
    vids.current.forEach((v, i) => { if (!v) return; if (Math.abs(v.currentTime - p) > 0.15) v.currentTime = p; v.muted = i !== cam; });
    if (p >= dur - 0.05) pauseAll();
  }, [dur, camAt, pauseAll]);

  const playPause = useCallback(() => {
    if (!ready) return;
    if (playing) { pauseAll(); return; }
    if (pos >= dur - 0.05) seekAll(0);
    vids.current.forEach((v) => v?.play().catch(() => {}));
    setPlaying(true);
    if (tick.current) clearInterval(tick.current);
    tick.current = setInterval(onTick, 100);
  }, [ready, playing, pos, dur, pauseAll, seekAll, onTick]);

  // ── Édition : coupe = bascule ──
  const cutHere = useCallback(() => {
    setCuts((prev) => {
      if (prev.some((c) => Math.abs(c - pos) < 0.2) || pos < 0.15 || pos > dur - 0.15) return prev; // évite coupes collées/aux bords
      return [...prev, pos].sort((a, z) => a - z);
    });
  }, [pos, dur]);

  const removeNearestCut = useCallback(() => {
    setCuts((prev) => {
      if (!prev.length) return prev;
      let bi = 0; for (let i = 1; i < prev.length; i++) if (Math.abs(prev[i] - pos) < Math.abs(prev[bi] - pos)) bi = i;
      return prev.filter((_, i) => i !== bi);
    });
  }, [pos]);

  // Trim : glisser une coupe (déplace le point de bascule, borné par ses voisins).
  // + APERÇU : les vidéos du haut DÉFILENT à la position de la poignée pour couper sur la bonne image.
  const onHandleMove = useCallback((clientX: number) => {
    const i = dragging.current;
    if (i === null || !trackRef.current) return;
    const r = trackRef.current.getBoundingClientRect();
    let t = Math.max(0, Math.min(dur, ((clientX - r.left) / r.width) * dur));
    const s = cuts.slice().sort((a, z) => a - z);
    const lo = i === 0 ? 0.1 : s[i - 1] + 0.1;
    const hi = i === s.length - 1 ? dur - 0.1 : s[i + 1] - 0.1;
    t = Math.max(lo, Math.min(hi, t));
    s[i] = t;
    setCuts(s);
    // l'image suit la poignée
    vids.current.forEach((v) => { if (v) v.currentTime = t; });
    setPos(t);
  }, [dur, cuts]);

  useEffect(() => {
    const mv = (e: PointerEvent) => { if (dragging.current !== null) { e.preventDefault(); onHandleMove(e.clientX); } };
    const up = () => { dragging.current = null; };
    window.addEventListener('pointermove', mv, { passive: false });
    window.addEventListener('pointerup', up);
    return () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); };
  }, [onHandleMove]);

  async function save() {
    const clean = segments.filter((s) => s.to - s.from >= 0.05);
    if (!clean.length) { setErr('La timeline est vide'); return; }
    setSaving(true); setErr(null);
    const payload: FilmMulticamSegment[] = clean.map((s) => ({ takeId: cameras[s.cam].takeId, fromSec: +s.from.toFixed(2), toSec: +s.to.toFixed(2) }));
    const { ok, status, d } = await filmApi.multicamEdit(projectId, sceneId, shotId, payload);
    setSaving(false);
    if (!ok) { setErr(d?.error || `HTTP ${status}`); return; }
    onClose(true);
  }

  const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  const rotate = (i: number) => setRot((r) => r.map((v, k) => (k === i ? (v + 90) % 360 : v)));
  const activeCam = camAt(pos);
  const sortedCuts = cuts.slice().sort((a, z) => a - z);

  return (
    <div className="fixed inset-0 z-[200] flex flex-col" style={{ background: '#0C0E12' }}>
      <div className="flex items-center gap-3 px-4 py-3 border-b border-[#1b2029]">
        <button type="button" onClick={() => onClose(false)} className="text-white/80 text-[22px] leading-none">×</button>
        <span className="text-white font-black text-[15px] truncate" style={{ fontFamily: "'Outfit',sans-serif" }}>Montage : {shotLabel}</span>
      </div>

      {/* Les 2 prises entières, calées, bonne orientation (pivoter au besoin). Celle à l'écran est vive. */}
      <div className="flex-1 overflow-y-auto px-3 pt-3 space-y-2.5">
        {cameras.map((c, i) => {
          const isOn = i === activeCam;
          const landscape = rot[i] % 180 === 0;
          return (
            <div key={c.takeId} className="relative rounded-xl overflow-hidden bg-black" style={{ border: `${isOn ? 2 : 1}px solid ${isOn ? CAM[i % 2].solid : '#232833'}` }}>
              <div className="w-full flex items-center justify-center" style={{ height: landscape ? 168 : 240 }}>
                <video ref={(el) => { vids.current[i] = el; }} src={c.url} playsInline preload="auto" onLoadedMetadata={recomputeDur}
                  style={{ maxWidth: '100%', maxHeight: '100%', transform: `rotate(${rot[i]}deg)`, transformOrigin: 'center' }} />
              </div>
              <span className="absolute top-2 left-2 px-2.5 py-1 rounded-full text-white text-[11.5px] font-extrabold" style={{ background: CAM[i % 2].solid, opacity: isOn ? 0.95 : 0.55 }}>
                {CAM[i % 2].name}{isOn ? ' · à l’écran' : ''}
              </span>
              <button type="button" onClick={() => rotate(i)} className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/60 text-white text-[15px] flex items-center justify-center" title="Pivoter">⤾</button>
            </div>
          );
        })}
      </div>

      {/* Caméra de départ */}
      <div className="px-3 pt-2 flex items-center gap-2">
        <span className="text-[11.5px]" style={{ color: '#6A7585' }}>Commencer par :</span>
        {cameras.map((c, i) => (
          <button type="button" key={c.takeId} onClick={() => setStartCam(i)} className="px-3 py-1.5 rounded-full text-[12px] font-extrabold"
            style={{ background: startCam === i ? CAM[i % 2].solid : 'transparent', border: `2px solid ${CAM[i % 2].solid}`, color: startCam === i ? '#fff' : CAM[i % 2].solid }}>
            {CAM[i % 2].name}
          </button>
        ))}
      </div>

      {/* Timeline : segments alternés (dérivés des coupes) + coupes glissables (trim) + scrub. */}
      <div className="px-3 pt-2">
        <div ref={trackRef} className="relative h-9 rounded-lg overflow-hidden flex select-none" style={{ background: '#232833' }}>
          {segments.map((s, i) => (
            <div key={i} className="relative h-full flex items-center justify-center" style={{ flex: Math.max(1, Math.round((s.to - s.from) * 1000)), background: CAM[s.cam % 2].solid }}>
              <span className="text-white text-[10px] font-bold opacity-80">{CAM[s.cam % 2].name.replace('Caméra ', 'C')}</span>
            </div>
          ))}
          {/* poignées de coupe (trim) */}
          {sortedCuts.map((cut, i) => (
            <div key={'h' + i} onPointerDown={(e) => { e.stopPropagation(); dragging.current = i; if (playing) pauseAll(); }}
              className="absolute top-0 h-full w-5 -ml-2.5 z-10 flex items-center justify-center cursor-ew-resize touch-none" style={{ left: `${(cut / dur) * 100}%` }}>
              <div className="w-1.5 h-7 rounded-full bg-white shadow" />
            </div>
          ))}
          <div className="absolute top-0 h-full w-0.5 bg-white/70 pointer-events-none" style={{ left: `${dur ? (pos / dur) * 100 : 0}%` }} />
        </div>
        <input type="range" min={0} max={dur || 1} step={0.01} value={Math.min(pos, dur || 1)}
          onChange={(e) => { if (playing) pauseAll(); seekAll(parseFloat(e.target.value)); }} className="w-full mt-2 accent-[#FF7F11]" />
        <div className="flex justify-between text-[11.5px]" style={{ color: '#6A7585' }}><span>{fmt(pos)}</span><span>{sortedCuts.length} coupe{sortedCuts.length > 1 ? 's' : ''}</span><span>{fmt(dur)}</span></div>
      </div>

      {/* Actions */}
      <div className="px-3 pt-1.5 pb-5" style={{ background: '#11141A' }}>
        {err && <p className="text-[#FF7A7A] text-[12.5px] mb-2">{err}</p>}
        <div className="flex items-center gap-2">
          <button type="button" onClick={playPause} className="w-11 h-11 rounded-full flex items-center justify-center text-white text-[20px]" style={{ background: '#FF7F11' }}>{playing ? '⏸' : '▶'}</button>
          <button type="button" onClick={cutHere} className="flex-1 h-11 rounded-xl text-white text-[13.5px] font-extrabold border-2 border-[#38404D]">✂ Couper ici (bascule)</button>
          <button type="button" onClick={removeNearestCut} className="px-3 h-11 rounded-xl text-white text-[13px] font-bold border-2 border-[#38404D]" title="Enlever la coupe la plus proche">↺</button>
        </div>
        <button type="button" onClick={save} disabled={saving} className="w-full mt-2 rounded-xl py-3 text-white font-extrabold text-[14px] disabled:opacity-60" style={{ fontFamily: "'Outfit',sans-serif", background: '#22C55E' }}>{saving ? 'Enregistrement…' : '✓ Enregistrer le montage'}</button>
        <p className="text-center text-[11px] mt-2" style={{ color: '#6A7585' }}>Choisis la caméra de départ, pose une coupe pour basculer, glisse une coupe pour ajuster.</p>
      </div>
    </div>
  );
}
