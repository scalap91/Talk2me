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
import { orientationGuidance, type CameraOrientation, type TargetCameraPose } from '@/lib/cards/project/orientation';

interface Shot { id: string; cameraRole?: string; intention?: string; framingGuide?: string; durationMs?: number; targetCameraPose?: TargetCameraPose; storyboardImage?: string }
interface Scene { id: string; title?: string; location?: string; shots?: Shot[] }

export default function TournagePage() {
  const { id } = useParams<{ id: string }>();
  const sp = useSearchParams();
  const router = useRouter();
  const sceneId = sp.get('scene') || '';
  const shotId = sp.get('shot') || '';

  const videoRef = useRef<HTMLVideoElement>(null);
  const [scene, setScene] = useState<Scene | null>(null);
  const [shot, setShot] = useState<Shot | null>(null);
  const [orient, setOrient] = useState<CameraOrientation | null>(null);
  const [camErr, setCamErr] = useState<string | null>(null);
  const [needMotion, setNeedMotion] = useState(false);

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
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
        if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play().catch(() => {}); }
      } catch (e) { setCamErr('Caméra indisponible (autorise l\'accès caméra). ' + (e instanceof Error ? e.message : '')); }
    })();
    return () => { stream?.getTracks().forEach((t) => t.stop()); };
  }, []);

  // 3) Capteurs d'orientation. alpha=cap→yaw, beta=avant/arrière→pitch, gamma=latéral→roll.
  const onOrient = useCallback((e: DeviceOrientationEvent) => {
    if (e.alpha == null && e.beta == null && e.gamma == null) return;
    setOrient({ yawDeg: e.alpha ?? 0, pitchDeg: e.beta ?? 0, rollDeg: e.gamma ?? 0 });
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

      {/* Bandeau ACTION / intention du plan */}
      {(shot?.intention || shot?.framingGuide) && (
        <div style={{ position: 'absolute', left: 12, right: 12, bottom: 24, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)', borderRadius: 14, padding: '10px 14px', color: '#fff' }}>
          {shot?.intention && <div style={{ fontSize: 14, fontWeight: 700 }}>{shot.intention}</div>}
          {shot?.framingGuide && <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.8)', marginTop: 2 }}>🎯 {shot.framingGuide}</div>}
        </div>
      )}

      {camErr && <div style={{ position: 'absolute', top: '50%', left: 16, right: 16, color: '#fff', background: 'rgba(192,57,43,0.9)', padding: 12, borderRadius: 10, fontSize: 13 }}>{camErr}</div>}
    </div>
  );
}
