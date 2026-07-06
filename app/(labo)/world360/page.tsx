'use client';

/**
 * Talk2Me — Monde 360° immersif (Pascal 2026-06-21).
 * Panorama 360° GÉNÉRÉ par HunyuanWorld-1.0 (FLUX.1-dev fp8, notre pod RunPod 4090)
 * plaqué sur une sphère inversée → on est DEDANS, on regarde tout autour.
 * Override : /world360?img=/uploads/xxx.png pour charger un autre panorama.
 */
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// Panorama par défaut = pièce générée par HunyuanWorld (remplace l'ancien SDXL).
const DEFAULT_PANO = '/uploads/hunyuan-piece.png';

export default function World360() {
  const mountRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState('Chargement du monde…');
  const PANO = typeof window !== 'undefined'
    ? (new URLSearchParams(window.location.search).get('img') || DEFAULT_PANO)
    : DEFAULT_PANO;

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    let raf = 0, disposed = false;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(72, mount.clientWidth / mount.clientHeight, 0.01, 1000);
    camera.position.set(0, 0, 0.1);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    mount.appendChild(renderer.domElement);

    // Sphère inversée = on voit la texture de l'INTÉRIEUR.
    const geo = new THREE.SphereGeometry(500, 64, 40);
    geo.scale(-1, 1, 1);
    const tex = new THREE.TextureLoader().load(
      PANO,
      () => { if (!disposed) setStatus('Monde 360° — glisse pour regarder autour de toi.'); },
      undefined,
      () => { if (!disposed) setStatus('Panorama indisponible.'); },
    );
    tex.colorSpace = THREE.SRGBColorSpace;
    const sphere = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex }));
    scene.add(sphere);

    // Regard 360° : on orbite la caméra (rayon minuscule) autour du centre.
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableZoom = false;
    controls.enablePan = false;
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.rotateSpeed = -0.35; // sens naturel (on "tourne la tête")
    controls.target.set(0, 0, 0);
    controls.minDistance = controls.maxDistance = 0.1;

    const onResize = () => {
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
    };
    window.addEventListener('resize', onResize);

    const animate = () => { raf = requestAnimationFrame(animate); controls.update(); renderer.render(scene, camera); };
    animate();

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      controls.dispose(); renderer.dispose();
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
    };
  }, []);

  return (
    <div className="fixed inset-0 bg-black">
      <div ref={mountRef} className="absolute inset-0" />
      <div className="absolute top-0 inset-x-0 z-10 px-4 py-3 bg-gradient-to-b from-black/70 to-transparent text-white">
        <div className="text-[15px] font-semibold">🌐 Pièce 360° — HunyuanWorld</div>
        <div className="text-[12px] text-white/70 mt-0.5">{status}</div>
      </div>
    </div>
  );
}
