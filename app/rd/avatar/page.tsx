'use client';

/**
 * Talk2Me R&D — /rd/avatar (Pascal 2026-06-13). BAC À SABLE, isolé de la prod.
 * Tourne-autour PHOTORÉALISTE : on rend Léa (GLB) sous N angles dans le navigateur
 * (le 3D contrôle la pose), chaque angle passe en SDXL img2img (la diffusion réalise)
 * → N frames photoréalistes. Puis on les affiche par-dessus TA caméra, posées au sol ;
 * tu glisses → l'angle suit → tu tournes autour, photoréaliste.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

const N = 12;                    // nombre d'angles (tous les 30°)
const SEED = 12345;              // même seed → cohérence d'identité entre angles
const CACHE = 'rd_lea_frames_v1';

export default function RdAvatarPage() {
  const capRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [frames, setFrames] = useState<string[]>([]);
  const [phase, setPhase] = useState<'idle' | 'gen' | 'view'>('idle');
  const [prog, setProg] = useState('');
  const [idx, setIdx] = useState(0);

  // charge le cache
  useEffect(() => {
    try { const c = JSON.parse(localStorage.getItem(CACHE) || '[]'); if (Array.isArray(c) && c.length === N) { setFrames(c); setPhase('view'); } } catch { /* */ }
  }, []);

  // caméra (ton espace réel) en fond quand on visualise
  useEffect(() => {
    if (phase !== 'view') return;
    let stream: MediaStream | null = null;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } } });
        if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play().catch(() => {}); }
      } catch { /* pas de caméra = fond noir, pas grave */ }
    })();
    return () => { stream?.getTracks().forEach((t) => t.stop()); };
  }, [phase]);

  // GÉNÉRATION : rend le GLB sous N angles + img2img chacun
  const generate = useCallback(async () => {
    setPhase('gen'); setProg('Chargement du moteur 3D…');
    const THREE = await import('three');
    const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');

    const canvas = capRef.current!;
    const CW = 576, CH = 1024;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(1); renderer.setSize(CW, CH);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x8a8a90); // fond gris neutre (comme la réf)
    const camera = new THREE.PerspectiveCamera(38, CW / CH, 0.05, 100);

    scene.add(new THREE.HemisphereLight(0xffffff, 0x444448, 1.1));
    const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(1.5, 3, 3); scene.add(key);
    const fill = new THREE.DirectionalLight(0xffffff, 0.8); fill.position.set(-2, 1, 2); scene.add(fill);

    const model: any = await new Promise((resolve, reject) => {
      new GLTFLoader().load('/uploads/9f6139bc-b014-4817-9248-ce92e3872aba.glb', (g) => resolve(g.scene), undefined, reject);
    }).catch(() => null);
    if (!model) { setProg('GLB introuvable.'); setPhase('idle'); return; }

    // centrer + cadrer plein cadre (buste→pieds)
    const box = new THREE.Box3().setFromObject(model);
    const c = box.getCenter(new THREE.Vector3()); const size = box.getSize(new THREE.Vector3());
    model.position.x -= c.x; model.position.z -= c.z; model.position.y -= box.min.y;
    const pivot = new THREE.Group(); pivot.add(model); scene.add(pivot);
    const targetY = size.y * 0.55;
    const dist = (size.y * 1.15) / Math.tan((camera.fov * Math.PI / 180) / 2) * 0.5 + size.z;
    camera.position.set(0, targetY, dist); camera.lookAt(0, targetY, 0);

    const out: string[] = [];
    for (let i = 0; i < N; i++) {
      pivot.rotation.y = -(i / N) * Math.PI * 2; // sens : on tourne autour d'elle
      renderer.render(scene, camera);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
      setProg(`Angle ${i + 1}/${N} → photoréaliste…`);
      try {
        const r = await fetch('/api/rd/avatar-i2i', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image_b64: dataUrl, seed: SEED, strength: 0.55 }),
        });
        const j = await r.json();
        if (j.ok && j.url) out.push(j.url);
        else { setProg(`Échec angle ${i + 1}: ${j.error || '?'}`); }
      } catch (e) { setProg(`Réseau angle ${i + 1}`); }
    }
    renderer.dispose();
    if (out.length === N) {
      try { localStorage.setItem(CACHE, JSON.stringify(out)); } catch { /* */ }
      setFrames(out); setIdx(0); setPhase('view'); setProg('');
    } else {
      setProg(`Seulement ${out.length}/${N} générés — réessaie.`); setPhase('idle');
    }
  }, []);

  // GLISSER pour tourner autour (azimut → frame)
  const drag = useRef<{ x: number; i: number } | null>(null);
  const onDown = (e: React.PointerEvent) => { drag.current = { x: e.clientX, i: idx }; };
  const onMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const dx = e.clientX - drag.current.x;
    const step = Math.round(dx / 28); // px par cran
    setIdx(((drag.current.i - step) % N + N) % N);
  };
  const onUp = () => { drag.current = null; };

  return (
    <main style={{ position: 'fixed', inset: 0, background: '#0d0d12', overflow: 'hidden', touchAction: 'none' }}>
      <canvas ref={capRef} style={{ display: 'none' }} />

      {phase === 'view' && (
        <>
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video ref={videoRef} muted playsInline style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
          <div
            onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
            style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={frames[idx]} alt="Léa" draggable={false}
              style={{ height: '88%', maxWidth: '100%', objectFit: 'contain', objectPosition: 'bottom', filter: 'drop-shadow(0 24px 28px rgba(0,0,0,.55))', userSelect: 'none', pointerEvents: 'none' }} />
          </div>
          <div style={{ position: 'fixed', bottom: 16, left: 12, right: 12, textAlign: 'center', color: '#fff', fontFamily: 'system-ui', fontSize: 13, background: 'rgba(0,0,0,.5)', padding: '8px 12px', borderRadius: 11, pointerEvents: 'none' }}>
            👆 Glisse pour tourner autour — angle {idx * 30}° · photoréaliste
          </div>
        </>
      )}

      {phase !== 'view' && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24, textAlign: 'center', color: '#fff', fontFamily: 'system-ui' }}>
          <div style={{ fontSize: 15, opacity: 0.9, maxWidth: 320 }}>
            <b>R&D — Léa photoréaliste 360°</b><br />
            Le 3D contrôle la pose, la diffusion réalise. {N} angles rendus puis passés en SDXL img2img.
          </div>
          {phase === 'gen'
            ? <div style={{ fontSize: 14, color: '#9fe' }}>{prog}</div>
            : <button onClick={generate} style={{ padding: '12px 22px', borderRadius: 14, border: 0, background: '#fff', color: '#000', fontWeight: 700, fontSize: 15 }}>Générer le tourne-autour</button>}
          {phase === 'idle' && prog && <div style={{ fontSize: 12, color: '#f99' }}>{prog}</div>}
        </div>
      )}

      <a href="/" style={{ position: 'fixed', top: 12, left: 12, zIndex: 9, padding: '8px 14px', borderRadius: 999, background: 'rgba(0,0,0,.55)', color: '#fff', fontFamily: 'system-ui', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>← Quitter R&D</a>
      {phase === 'view' && (
        <button onClick={() => { try { localStorage.removeItem(CACHE); } catch { /* */ } setFrames([]); setPhase('idle'); }}
          style={{ position: 'fixed', top: 12, right: 12, zIndex: 9, padding: '8px 14px', borderRadius: 999, background: 'rgba(0,0,0,.55)', color: '#fff', fontFamily: 'system-ui', fontSize: 13, fontWeight: 600, border: 0 }}>↻ Regénérer</button>
      )}
    </main>
  );
}
