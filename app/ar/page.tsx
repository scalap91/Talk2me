'use client';

/**
 * Talk2Me — AR : poser Léa (avatar 3D) ANCRÉE dans la pièce. (Pascal 2026-06-13)
 * MVP via <model-viewer> : Scene Viewer (Android) + Quick Look (iPhone).
 * → détection de sol, tap pour placer, échelle réelle, on tourne autour, ancré.
 * GLB (Android) + USDZ (iPhone). Zéro app native à builder.
 */

import { useEffect, useRef, useState } from 'react';

const GLB = '/uploads/9f6139bc-b014-4817-9248-ce92e3872aba.glb';
const USDZ = '/uploads/da8e0d60-8289-45f6-8503-dbddb38d60d7.usdz';

export default function ArPage() {
  const host = useRef<HTMLDivElement>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    // avatar créé in-app (RPM) passé en ?glb=&usdz=, sinon Léa par défaut
    const q = new URLSearchParams(window.location.search);
    const glb = q.get('glb') || GLB;
    const usdz = q.get('usdz') || USDZ;

    // charge le web component model-viewer (CDN module)
    const s = document.createElement('script');
    s.type = 'module';
    s.src = 'https://unpkg.com/@google/model-viewer@3.5.0/dist/model-viewer.min.js';
    s.onload = () => setLoaded(true);
    document.head.appendChild(s);

    if (host.current) {
      host.current.innerHTML = `
        <model-viewer
          src="${glb}"
          ios-src="${usdz}"
          alt="Léa 3D"
          ar
          ar-modes="scene-viewer quick-look webxr"
          ar-scale="fixed"
          ar-placement="floor"
          camera-controls
          touch-action="pan-y"
          autoplay
          shadow-intensity="1"
          environment-image="neutral"
          style="width:100%;height:100%;background:#0e0e14;"
        >
          <button slot="ar-button"
            style="position:absolute;bottom:28px;left:50%;transform:translateX(-50%);
                   padding:16px 28px;border-radius:999px;border:0;background:#8b5cff;color:#fff;
                   font-weight:800;font-size:16px;box-shadow:0 6px 24px rgba(139,92,255,.5)">
            🧍 Voir Léa dans ta pièce
          </button>
          <div slot="poster" style="display:flex;align-items:center;justify-content:center;height:100%;color:#fff;font-family:system-ui">
            Chargement de Léa 3D…
          </div>
        </model-viewer>`;
    }
    return () => { try { s.remove(); } catch {} };
  }, []);

  return (
    <main style={{ position: 'fixed', inset: 0, background: '#0e0e14', color: '#fff', fontFamily: 'system-ui' }}>
      <div ref={host} style={{ position: 'absolute', inset: 0 }} />
      <div style={{ position: 'fixed', top: 14, left: 14, right: 14, padding: '10px 14px', background: 'rgba(0,0,0,.55)', borderRadius: 12, fontSize: 13, zIndex: 5, pointerEvents: 'none' }}>
        <b>Léa en AR</b> — tape <b>« Voir Léa dans ta pièce »</b>, vise ton sol, pose-la. Elle reste ancrée, tu tournes autour.
        {!loaded && <div style={{ color: '#8b5cff', marginTop: 4 }}>chargement du moteur 3D…</div>}
      </div>
    </main>
  );
}
