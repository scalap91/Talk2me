'use client';

/**
 * Talk2Me — Monde 3D (Pascal 2026-06-21) : on PLANTE LE DÉCOR.
 * Récupère les contours des vrais bâtiments (OSM) autour d'un point, les
 * géoréférence via lib/world/geo-anchor, les extrude en 3D, et te laisse te
 * balader. Preuve visuelle du monde géoréférencé (base du futur monde des pièces).
 */
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { worldFromGps, type LatLng } from '@/lib/world/geo-anchor';

export default function WorldPage() {
  const mountRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState('Chargement des bâtiments de Tana…');

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    let raf = 0;
    let renderer: THREE.WebGLRenderer | null = null;
    let controls: OrbitControls | null = null;
    let disposed = false;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0e1116);
    scene.fog = new THREE.Fog(0x0e1116, 300, 1400);

    const camera = new THREE.PerspectiveCamera(60, mount.clientWidth / mount.clientHeight, 1, 4000);
    camera.position.set(0, 220, 320);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    mount.appendChild(renderer.domElement);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.maxPolarAngle = Math.PI / 2.05; // pas sous le sol
    controls.target.set(0, 0, 0);

    // Lumières
    scene.add(new THREE.AmbientLight(0xffffff, 0.65));
    const sun = new THREE.DirectionalLight(0xffffff, 1.1);
    sun.position.set(300, 600, 200);
    scene.add(sun);

    // Sol
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(4000, 4000),
      new THREE.MeshStandardMaterial({ color: 0x1a2029, roughness: 1 }),
    );
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);
    // Grille repère
    scene.add(new THREE.GridHelper(4000, 80, 0x2a3340, 0x202832));

    const onResize = () => {
      if (!renderer) return;
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
    };
    window.addEventListener('resize', onResize);

    const animate = () => {
      raf = requestAnimationFrame(animate);
      controls?.update();
      renderer?.render(scene, camera);
    };
    animate();

    // Charge + extrude les bâtiments OSM, géoréférencés
    (async () => {
      try {
        const r = await fetch('/api/world/buildings?lat=-18.9100&lng=47.5256&r=450', { cache: 'no-store' });
        const d = await r.json();
        if (disposed) return;
        const origin: LatLng = d.origin;
        const mat = new THREE.MeshStandardMaterial({ color: 0x6b7a8f, roughness: 0.85, metalness: 0.05 });
        const edgeMat = new THREE.LineBasicMaterial({ color: 0x9fb3c8, transparent: true, opacity: 0.25 });
        let built = 0;

        for (const b of d.buildings as { pts: LatLng[]; height: number }[]) {
          const shape = new THREE.Shape();
          b.pts.forEach((p, i) => {
            const { x, z } = worldFromGps(p, origin);
            if (i === 0) shape.moveTo(x, z); else shape.lineTo(x, z);
          });
          const geo = new THREE.ExtrudeGeometry(shape, { depth: b.height, bevelEnabled: false });
          geo.rotateX(-Math.PI / 2); // le plan (x,z) devient horizontal, extrusion vers le haut
          const mesh = new THREE.Mesh(geo, mat);
          scene.add(mesh);
          const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), edgeMat);
          scene.add(edges);
          built++;
        }
        setStatus(`${built} bâtiments de Tana plantés — balade : glisser pour tourner, molette pour zoomer.`);
      } catch (e) {
        setStatus('Échec du chargement des bâtiments : ' + (e as Error).message);
      }
    })();

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      controls?.dispose();
      renderer?.dispose();
      if (renderer && mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
    };
  }, []);

  return (
    <div className="fixed inset-0 bg-[#0e1116]">
      <div ref={mountRef} className="absolute inset-0" />
      <div className="absolute top-0 inset-x-0 z-10 px-4 py-3 bg-gradient-to-b from-black/70 to-transparent text-white">
        <div className="text-[15px] font-semibold">🌍 Monde Talk2Me — Antananarivo (test décor)</div>
        <div className="text-[12px] text-white/70 mt-0.5">{status}</div>
      </div>
    </div>
  );
}
