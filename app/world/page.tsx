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

/** Étiquette texte 3D (sprite via canvas) — pour noms de rue / quartier. */
function makeLabel(text: string, opts: { color?: string; bg?: string; size?: number; worldH?: number } = {}): THREE.Sprite {
  const { color = '#dfe7ef', bg = 'rgba(10,14,20,0.55)', size = 42, worldH = 26 } = opts;
  const pad = 14;
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d')!;
  const font = `600 ${size}px -apple-system, Segoe UI, Roboto, sans-serif`;
  ctx.font = font;
  const w = Math.ceil(ctx.measureText(text).width) + pad * 2;
  const h = size + pad * 2;
  c.width = w; c.height = h;
  ctx.font = font;
  ctx.fillStyle = bg; if (bg) { ctx.fillRect(0, 0, w, h); }
  ctx.fillStyle = color; ctx.textBaseline = 'middle';
  ctx.fillText(text, pad, h / 2);
  const tex = new THREE.CanvasTexture(c); tex.anisotropy = 4;
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  spr.scale.set((w / h) * worldH, worldH, 1);
  return spr;
}

/** Texture de façade procédurale : mur + grille de fenêtres (certaines allumées). */
function makeFacadeTexture(wall: string): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = 128; c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = wall; ctx.fillRect(0, 0, 128, 128);
  const cols = 4, rows = 4, gap = 8, w = (128 - gap * (cols + 1)) / cols, h = (128 - gap * (rows + 1)) / rows;
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
    const lit = (i * 7 + j * 13) % 5 === 0;
    ctx.fillStyle = lit ? '#ffd98a' : 'rgba(20,28,38,0.92)';
    ctx.fillRect(gap + i * (w + gap), gap + j * (h + gap), w, h);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

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
        // Palette de façades texturées (mur + fenêtres) — variété par bâtiment.
        const walls = ['#8a7f72', '#7d8893', '#9a8d7a', '#6f7b86', '#94857b'];
        const mats = walls.map((w) => {
          const tex = makeFacadeTexture(w);
          tex.repeat.set(0.06, 0.06); // ~1 motif / 16 m (UV monde de l'extrusion)
          return new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9, metalness: 0.03 });
        });
        const edgeMat = new THREE.LineBasicMaterial({ color: 0x9fb3c8, transparent: true, opacity: 0.18 });
        let built = 0;
        const placed: { mesh: THREE.Mesh; cx: number; cz: number }[] = []; // pour la texture Mapillary

        for (const b of d.buildings as { pts: LatLng[]; height: number }[]) {
          const shape = new THREE.Shape();
          let sx = 0, sz = 0;
          b.pts.forEach((p, i) => {
            const { x, z } = worldFromGps(p, origin);
            sx += x; sz += z;
            if (i === 0) shape.moveTo(x, z); else shape.lineTo(x, z);
          });
          const geo = new THREE.ExtrudeGeometry(shape, { depth: b.height, bevelEnabled: false });
          geo.rotateX(-Math.PI / 2); // le plan (x,z) devient horizontal, extrusion vers le haut
          const mesh = new THREE.Mesh(geo, mats[built % mats.length]);
          scene.add(mesh);
          placed.push({ mesh, cx: sx / b.pts.length, cz: sz / b.pts.length });
          const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), edgeMat);
          scene.add(edges);
          built++;
        }

        // RUES : tracé au sol + nom (1 label par rue, au milieu).
        const roadLineMat = new THREE.LineBasicMaterial({ color: 0x4a5666 });
        const seenRoad = new Set<string>();
        for (const road of (d.roads || []) as { name: string; pts: LatLng[] }[]) {
          const v = road.pts.map((p) => { const { x, z } = worldFromGps(p, origin); return new THREE.Vector3(x, 0.6, z); });
          if (v.length < 2) continue;
          scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(v), roadLineMat));
          if (!seenRoad.has(road.name)) {
            seenRoad.add(road.name);
            const mid = v[Math.floor(v.length / 2)];
            const lbl = makeLabel(road.name, { color: '#aebfd0', size: 34, worldH: 16 });
            lbl.position.set(mid.x, 10, mid.z);
            scene.add(lbl);
          }
        }

        // QUARTIERS / lieux : gros label élevé.
        for (const pl of (d.places || []) as { name: string; lat: number; lng: number }[]) {
          const { x, z } = worldFromGps(pl, origin);
          const lbl = makeLabel(pl.name.toUpperCase(), { color: '#ffd479', bg: 'rgba(10,14,20,0.7)', size: 52, worldH: 42 });
          lbl.position.set(x, 70, z);
          scene.add(lbl);
        }

        const nRoads = new Set((d.roads || []).map((r: { name: string }) => r.name)).size;
        setStatus(`${built} bâtiments · ${nRoads} rues · ${(d.places || []).length} quartiers — glisser pour tourner, molette pour zoomer.`);

        // PEAU MAPILLARY : vraies façades rue par rue (si MAPILLARY_TOKEN présent).
        // Repli propre : pas de token / pas d'image → on garde la texture procédurale.
        try {
          const sv = await fetch('/api/world/streetview?lat=-18.9100&lng=47.5256&r=450', { cache: 'no-store' }).then((x) => x.json());
          if (sv?.configured && Array.isArray(sv.images) && sv.images.length) {
            const imgs = (sv.images as { lat: number; lng: number; url: string }[])
              .map((im) => { const { x, z } = worldFromGps(im, origin); return { x, z, url: im.url }; });
            // les bâtiments les plus proches du centre d'abord (perf : on plafonne)
            const near = placed
              .map((p) => ({ p, d: p.cx * p.cx + p.cz * p.cz }))
              .sort((a, b) => a.d - b.d).slice(0, 60);
            const loader = new THREE.TextureLoader(); loader.setCrossOrigin('anonymous');
            let textured = 0;
            for (const { p } of near) {
              // image Mapillary la plus proche du bâtiment
              let best = null as null | { url: string; d: number };
              for (const im of imgs) {
                const dd = (im.x - p.cx) ** 2 + (im.z - p.cz) ** 2;
                if (!best || dd < best.d) best = { url: im.url, d: dd };
              }
              if (!best || best.d > 60 * 60) continue; // > 60 m → pas pertinent
              const tex = loader.load(best.url);
              tex.colorSpace = THREE.SRGBColorSpace;
              p.mesh.material = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 });
              textured++;
            }
            if (textured) setStatus(`${built} bâtiments (${textured} avec vraie façade Mapillary) · ${nRoads} rues · ${(d.places || []).length} quartiers.`);
          }
        } catch { /* repli procédural : rien à faire */ }
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
