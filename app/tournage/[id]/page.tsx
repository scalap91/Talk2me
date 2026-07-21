'use client';
/**
 * /tournage/[id] — ÉCRAN DE TOURNAGE AUGMENTÉ (VS3). Pascal 2026-07-21.
 *
 * La caméra du téléphone en plein cadre + surimpression 2D du storyboard : grille des tiers, cadre
 * sûr, bandeau ACTION, et GUIDAGE d'orientation en temps réel (« Tourne à droite 3° » → « ✓ Cadrage
 * aligné »), calculé par la brique PURE `orientation.ts` (fidèle au package figé). On commence en 2D
 * (pas d'AR lourde). Capteurs via DeviceOrientation (web/WebView) ; ARCore/ARKit = V2.
 *
 * Lit le plan (targetCameraPose) depuis la carte projet (GET /api/project/[id]). Ne code AUCUN
 * rendu de card ici : c'est un OUTIL de tournage, pas un lecteur de .card.
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { orientationGuidance, compareCameraOrientation, type CameraOrientation, type TargetCameraPose } from '@/lib/cards/project/orientation';

interface Shot { id: string; cameraRole?: string; intention?: string; framingGuide?: string; placement?: string; durationMs?: number; targetCameraPose?: TargetCameraPose; storyboardImage?: string; cam?: number; pass?: number }
interface Scene { id: string; title?: string; location?: string; summary?: string; action?: string; dialogue?: string; shots?: Shot[] }

export default function TournagePage() {
  const { id } = useParams<{ id: string }>();
  const sp = useSearchParams();
  const router = useRouter();
  const sceneId = sp.get('scene') || '';
  const shotId = sp.get('shot') || '';

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const oriSamplesRef = useRef<{ yaw: number; pitch: number; roll: number }[]>([]);
  const orientRef = useRef<CameraOrientation | null>(null);
  const oriTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const [scene, setScene] = useState<Scene | null>(null);
  const [shot, setShot] = useState<Shot | null>(null);
  const [orient, setOrient] = useState<CameraOrientation | null>(null);
  const [camErr, setCamErr] = useState<string | null>(null);
  const [needMotion, setNeedMotion] = useState(false);
  const [recording, setRecording] = useState(false);
  const [saving, setSaving] = useState(false);
  const [takeMsg, setTakeMsg] = useState<string | null>(null);
  const [portrait, setPortrait] = useState(false);
  // Salle live multicaméra (VS4b) — auto-live si on a scanné le QR (?live=1)
  const [live, setLive] = useState(sp.get('live') === '1');
  const [qr, setQr] = useState<string | null>(null);
  const esRef = useRef<EventSource | null>(null);
  const [liveMsg, setLiveMsg] = useState<string | null>(null);

  // Orientation de l'écran : le layout s'adapte (portrait ↔ paysage) pour garder TOUTES les infos.
  useEffect(() => {
    const check = () => setPortrait(typeof window !== 'undefined' && window.innerHeight > window.innerWidth);
    check();
    window.addEventListener('resize', check);
    window.addEventListener('orientationchange', check);
    return () => { window.removeEventListener('resize', check); window.removeEventListener('orientationchange', check); };
  }, []);

  // 1) Charger le plan (targetCameraPose) depuis la carte projet.
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`/api/project/${id}?context=full`, { credentials: 'include' });
        const d = await r.json();
        const scenes: Scene[] = d?.card?.project?.film?.scenes || [];
        const sc = scenes.find((s) => s.id === sceneId) || scenes[0] || null;
        setScene(sc);
        const sh = (sc?.shots || []).find((x) => x.id === shotId) || (sc?.shots || [])[0] || null;
        setShot(sh);
      } catch { /* réseau : on affiche quand même la caméra */ }
    })();
  }, [id, sceneId, shotId]);

  // 2) Ouvrir la caméra arrière.
  useEffect(() => {
    let stream: MediaStream | null = null;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: true });
        streamRef.current = stream;
        if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play().catch(() => {}); }
      } catch (e) { setCamErr('Caméra indisponible (autorise l\'accès caméra). ' + (e instanceof Error ? e.message : '')); }
    })();
    return () => { stream?.getTracks().forEach((t) => t.stop()); };
  }, []);

  // 3) Capteurs d'orientation. alpha=cap→yaw, beta=avant/arrière→pitch, gamma=latéral→roll.
  const onOrient = useCallback((e: DeviceOrientationEvent) => {
    if (e.alpha == null && e.beta == null && e.gamma == null) return;
    const o = { yawDeg: e.alpha ?? 0, pitchDeg: e.beta ?? 0, rollDeg: e.gamma ?? 0 };
    orientRef.current = o;
    setOrient(o);
  }, []);
  const startMotion = useCallback(async () => {
    // iOS : permission explicite requise.
    const D = (window as unknown as { DeviceOrientationEvent?: { requestPermission?: () => Promise<string> } }).DeviceOrientationEvent;
    if (D?.requestPermission) {
      try { const p = await D.requestPermission(); if (p !== 'granted') { setNeedMotion(true); return; } } catch { setNeedMotion(true); return; }
    }
    window.addEventListener('deviceorientation', onOrient, true);
    setNeedMotion(false);
  }, [onOrient]);
  useEffect(() => {
    const D = (window as unknown as { DeviceOrientationEvent?: { requestPermission?: () => Promise<string> } }).DeviceOrientationEvent;
    if (D?.requestPermission) { setNeedMotion(true); return; } // iOS : attend un tap
    window.addEventListener('deviceorientation', onOrient, true);
    return () => window.removeEventListener('deviceorientation', onOrient, true);
  }, [onOrient]);

  const target = shot?.targetCameraPose;
  const guide = orient && target ? orientationGuidance(orient, target) : null;

  // Envoie un signal à la salle (action/cut/join/leave). Le bus diffuse à toutes les cams.
  const sendSignal = useCallback(async (type: 'action' | 'cut' | 'join' | 'leave') => {
    if (!shot?.id) return;
    try {
      await fetch(`/api/project/${id}/shoot-signal`, { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ shot_id: shot.id, type }) });
    } catch { /* best-effort */ }
  }, [id, shot?.id]);

  // Mode LIVE : rejoint la salle (single-live : coupe les autres lives), écoute les signaux, génère le QR.
  useEffect(() => {
    if (!live || !shot?.id) return;
    const shotId2 = shot.id;
    void sendSignal('join');
    setLiveMsg('🔴 En live — « Action » déclenche toutes les caméras.');
    // QR de la salle (mêmes scène/plan + live=1) — les autres scannent pour rejoindre.
    if (typeof window !== 'undefined') {
      const joinUrl = `${window.location.origin}${window.location.pathname}?scene=${encodeURIComponent(sceneId)}&shot=${encodeURIComponent(shotId2)}&live=1`;
      import('qrcode').then((m) => {
        const QR = ((m as unknown as { default?: { toDataURL: (t: string, o?: unknown) => Promise<string> } }).default ?? (m as unknown as { toDataURL: (t: string, o?: unknown) => Promise<string> }));
        QR.toDataURL(joinUrl, { margin: 1, width: 260 }).then(setQr).catch(() => {});
      }).catch(() => {});
    }
    const es = new EventSource(`/api/project/${id}/shoot-events?shot=${encodeURIComponent(shotId2)}`);
    es.addEventListener('activity_state', (e) => {
      try {
        const d = JSON.parse((e as MessageEvent).data) as { shoot?: string };
        if (d.shoot === 'action') startRec();
        else if (d.shoot === 'cut') stopRec();
      } catch { /* */ }
    });
    esRef.current = es;
    return () => { es.close(); esRef.current = null; void sendSignal('leave'); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, shot?.id]);

  // ── Enregistrement de la prise (VS4) : capture flux + orientation, upload, dépose la prise ──
  function startRec() {
    const stream = streamRef.current;
    if (!stream || recording) return;
    chunksRef.current = []; oriSamplesRef.current = [];
    const mime = typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported('video/mp4') ? 'video/mp4'
      : (MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm');
    const rec = new MediaRecorder(stream, { mimeType: mime });
    rec.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data); };
    rec.onstop = () => void saveTake();
    recRef.current = rec; rec.start(); setRecording(true); setTakeMsg(null);
    oriTimer.current = setInterval(() => { const o = orientRef.current; if (o) oriSamplesRef.current.push({ yaw: o.yawDeg, pitch: o.pitchDeg, roll: o.rollDeg }); }, 200);
  }
  function stopRec() {
    if (oriTimer.current) { clearInterval(oriTimer.current); oriTimer.current = null; }
    recRef.current?.stop(); setRecording(false);
  }
  async function saveTake() {
    setSaving(true);
    try {
      const blob = new Blob(chunksRef.current, { type: chunksRef.current[0]?.type || 'video/webm' });
      const ext = blob.type.includes('mp4') ? 'mp4' : 'webm';
      const fd = new FormData(); fd.append('file', new File([blob], `prise.${ext}`, { type: blob.type }));
      const up = await fetch('/api/upload', { method: 'POST', credentials: 'include', body: fd }).then((r) => r.json());
      if (!up?.url) { setTakeMsg('Upload de la prise échoué.'); return; }
      const samples = oriSamplesRef.current;
      const score = target && samples.length
        ? samples.reduce((a, s) => a + compareCameraOrientation({ yawDeg: s.yaw, pitchDeg: s.pitch, rollDeg: s.roll }, target).score, 0) / samples.length
        : undefined;
      const r = await fetch(`/api/project/${id}/takes`, { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ scene_id: scene?.id, shot_id: shot?.id, media_url: up.url, orientation: samples, ...(score !== undefined ? { orientationScore: score } : {}) }) });
      const d = await r.json();
      if (!r.ok) { setTakeMsg(d?.need ? `À valider : ${d.need}` : (d?.error || 'Dépôt de la prise échoué.')); return; }
      setTakeMsg(`✅ Prise enregistrée${score !== undefined ? ` · cadrage ${Math.round(score * 100)}%` : ''}`);
    } catch (e) { setTakeMsg(String(e)); } finally { setSaving(false); }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000', overflow: 'hidden' }}>
      <video ref={videoRef} playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />

      {/* Grille des tiers + cadre sûr */}
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
        <g stroke="rgba(255,255,255,0.35)" strokeWidth="0.2">
          <line x1="33.3" y1="0" x2="33.3" y2="100" /><line x1="66.6" y1="0" x2="66.6" y2="100" />
          <line x1="0" y1="33.3" x2="100" y2="33.3" /><line x1="0" y1="66.6" x2="100" y2="66.6" />
        </g>
        <rect x="5" y="7" width="90" height="86" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="0.3" strokeDasharray="2 1.5" rx="1.5" />
      </svg>

      {/* Esquisse storyboard semi-transparente (si générée) */}
      {shot?.storyboardImage && (
        <img src={shot.storyboardImage} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', opacity: 0.28, pointerEvents: 'none' }} />
      )}

      {/* Barre haut : retour + scène/plan */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', background: 'linear-gradient(rgba(0,0,0,0.55),transparent)' }}>
        <button onClick={() => router.back()} style={{ background: 'rgba(0,0,0,0.4)', border: 0, color: '#fff', fontSize: 15, fontWeight: 700, borderRadius: 20, padding: '6px 12px' }}>← Retour</button>
        <div style={{ color: '#fff', fontSize: 13, fontWeight: 700, textShadow: '0 1px 3px rgba(0,0,0,0.6)' }}>
          {shot?.cam ? <span style={{ color: '#B39DFF' }}>CAM {shot.cam}{shot.pass && shot.pass > 1 ? ` · passe ${shot.pass}` : ''} · </span> : null}
          {scene?.title || 'Scène'}{shot?.cameraRole ? ` · ${shot.cameraRole.toUpperCase()}` : ''}
        </div>
      </div>

      {/* Guidage d'orientation (couleur selon alignement) */}
      <div style={{ position: 'absolute', top: '46%', left: 0, right: 0, textAlign: 'center', pointerEvents: 'none' }}>
        {needMotion ? (
          <button onClick={startMotion} style={{ pointerEvents: 'auto', background: 'rgba(255,127,17,0.92)', color: '#fff', border: 0, borderRadius: 24, padding: '12px 20px', fontWeight: 800, fontSize: 15 }}>Activer le guidage caméra</button>
        ) : !target ? (
          <span style={{ color: 'rgba(255,255,255,0.85)', fontSize: 13, background: 'rgba(0,0,0,0.4)', padding: '6px 12px', borderRadius: 16 }}>Pas d&apos;orientation cible pour ce plan</span>
        ) : guide ? (
          <div style={{ display: 'inline-block', background: guide.aligned ? 'rgba(34,181,115,0.92)' : 'rgba(0,0,0,0.6)', color: '#fff', borderRadius: 22, padding: '10px 18px', fontWeight: 800, fontSize: 16, boxShadow: '0 4px 16px rgba(0,0,0,0.4)' }}>
            {guide.hints.join('  ·  ')}
          </div>
        ) : null}
      </div>

      {/* Panneau latéral GAUCHE — prompteur : action + dialogues de la scène (comme le mockup) */}
      {(scene?.action || scene?.dialogue || scene?.summary) && (
        <div style={portrait
          ? { position: 'absolute', left: 0, right: 0, bottom: 168, maxHeight: '30vh', overflowY: 'auto', padding: '10px 14px', background: 'linear-gradient(0deg, rgba(0,0,0,0.72), rgba(0,0,0,0.05))', color: '#fff', WebkitOverflowScrolling: 'touch' }
          : { position: 'absolute', left: 0, top: 56, bottom: 176, width: '42%', maxWidth: 360, overflowY: 'auto', padding: '10px 12px', background: 'linear-gradient(90deg, rgba(0,0,0,0.62), rgba(0,0,0,0.15))', color: '#fff', WebkitOverflowScrolling: 'touch' }}>
          {scene?.title && <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6, color: 'rgba(255,255,255,0.65)', fontWeight: 800 }}>{scene.title}</div>}
          {(scene?.action || scene?.summary) && (
            <div style={{ marginTop: 6 }}>
              <div style={{ fontSize: 10.5, color: 'var(--t2m-primary,#FF7F11)', fontWeight: 800 }}>ACTION</div>
              <div style={{ fontSize: 13, lineHeight: 1.4, color: 'rgba(255,255,255,0.92)', textShadow: '0 1px 2px rgba(0,0,0,0.7)' }}>{scene.action || scene.summary}</div>
            </div>
          )}
          {scene?.dialogue && (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 10.5, color: 'var(--t2m-primary,#FF7F11)', fontWeight: 800 }}>DIALOGUES</div>
              <div style={{ fontSize: 14, lineHeight: 1.5, color: '#fff', whiteSpace: 'pre-wrap', textShadow: '0 1px 2px rgba(0,0,0,0.8)', fontWeight: 600 }}>{scene.dialogue}</div>
            </div>
          )}
        </div>
      )}

      {/* Bouton REC (VS4) — en LIVE il envoie « Action/Coupez » à TOUTES les cams (VS4b) */}
      {!camErr && (
        <div style={{ position: 'absolute', bottom: 92, left: 0, right: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          {takeMsg && <div style={{ background: 'rgba(0,0,0,0.6)', color: '#fff', fontSize: 13, fontWeight: 700, padding: '6px 12px', borderRadius: 16 }}>{takeMsg}</div>}
          {live && <div style={{ color: recording ? '#E53935' : '#fff', fontSize: 13, fontWeight: 800, textShadow: '0 1px 3px #000' }}>{recording ? '● TOUTES LES CAMS TOURNENT' : '🎬 ACTION = déclenche toutes les cams'}</div>}
          <button onClick={() => (live ? sendSignal(recording ? 'cut' : 'action') : (recording ? stopRec() : startRec()))} disabled={saving} aria-label={recording ? 'Coupez' : 'Action'}
            style={{ width: 78, height: 78, borderRadius: '50%', border: `4px solid ${live ? '#FF7F11' : 'rgba(255,255,255,0.9)'}`, background: 'transparent', display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
            <span style={{ width: recording ? 28 : 58, height: recording ? 28 : 58, borderRadius: recording ? 6 : '50%', background: saving ? '#9AA3AF' : '#E53935', transition: 'all .15s' }} />
          </button>
        </div>
      )}

      {/* Toggle Live + QR de la salle (cam principale) */}
      <div style={{ position: 'absolute', top: 12, right: 12, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
        <button onClick={() => { setLive((v) => !v); setQr(null); }} style={{ background: live ? 'rgba(229,57,53,0.92)' : 'rgba(0,0,0,0.45)', border: 0, color: '#fff', fontSize: 13, fontWeight: 800, borderRadius: 20, padding: '7px 13px' }}>
          {live ? '⏹ Quitter le live' : '📡 Live multicam'}
        </button>
        {live && qr && (
          <div style={{ background: '#fff', padding: 8, borderRadius: 10, textAlign: 'center' }}>
            <img src={qr} alt="QR" style={{ width: 120, height: 120, display: 'block' }} />
            <div style={{ fontSize: 10, color: '#333', fontWeight: 700, marginTop: 2 }}>Scanne pour<br />devenir Cam 2/3</div>
          </div>
        )}
      </div>
      {liveMsg && live && <div style={{ position: 'absolute', top: 92, left: 12, background: 'rgba(229,57,53,0.85)', color: '#fff', fontSize: 12, fontWeight: 700, padding: '5px 10px', borderRadius: 14 }}>{liveMsg}</div>}

      {/* Bandeau ACTION / intention du plan */}
      {(shot?.intention || shot?.framingGuide) && (
        <div style={{ position: 'absolute', left: 12, right: 12, bottom: 24, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)', borderRadius: 14, padding: '10px 14px', color: '#fff' }}>
          {shot?.intention && <div style={{ fontSize: 14, fontWeight: 700 }}>{shot.intention}</div>}
          {shot?.placement && <div style={{ fontSize: 12.5, color: '#FFD48A', marginTop: 2 }}>📍 {shot.placement}</div>}
          {shot?.framingGuide && <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.8)', marginTop: 2 }}>🎯 {shot.framingGuide}</div>}
        </div>
      )}

      {camErr && <div style={{ position: 'absolute', top: '50%', left: 16, right: 16, color: '#fff', background: 'rgba(192,57,43,0.9)', padding: 12, borderRadius: 10, fontSize: 13 }}>{camErr}</div>}
    </div>
  );
}
