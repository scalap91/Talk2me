'use client';

/**
 * Talk2Me — Pièce 3D HunyuanWorld (Pascal 2026-06-21).
 * Charge le MESH 3D en couches généré par HunyuanWorld-1.0 (scenegen : panorama →
 * décomposition en couches → profondeur MoGe → maillage). On est DEDANS : on glisse
 * pour regarder, on pince/molette pour avancer. VRAIE 3D (profondeur + parallaxe),
 * pas une image 360°.
 * Override : /piece3d?glb=/uploads/xxx.glb
 */
import { useEffect, useRef, useState } from 'react';

import { goBack } from '@/lib/client/go-back';

const DEFAULT_GLB = '/uploads/piece_world.glb';

export default function Piece3D() {
  const mountRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState('Chargement de la pièce 3D…');

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    let raf = 0;
    let disposed = false;
    let dispose = () => {};

    (async () => {
      const THREE = await import('three');
      const { OrbitControls } = await import('three/examples/jsm/controls/OrbitControls.js');
      const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');

      const glb = new URLSearchParams(window.location.search).get('glb') || DEFAULT_GLB;
      let moveSpeed = 0.05; // recalé à l'échelle de la scène après chargement

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x0a0a0f);

      const camera = new THREE.PerspectiveCamera(70, mount.clientWidth / mount.clientHeight, 0.01, 2000);
      camera.position.set(0, 0, 0.01);

      const renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setSize(mount.clientWidth, mount.clientHeight);
      renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
      mount.appendChild(renderer.domElement);

      // Lumière forte : le mesh a des couleurs par sommet, on veut qu'elles ressortent.
      scene.add(new THREE.AmbientLight(0xffffff, 2.2));
      scene.add(new THREE.HemisphereLight(0xffffff, 0x404040, 1.2));

      // Contrôles : on regarde autour (drag), on avance (pince/molette = zoom), pan.
      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.08;
      controls.rotateSpeed = -0.3;
      controls.zoomSpeed = 1.4;
      controls.panSpeed = 0.8;
      controls.target.set(0, 0, -1);

      new GLTFLoader().load(
        glb,
        (gltf) => {
          if (disposed) return;
          // Les couleurs par sommet : force vertexColors + matériau non métallique lisible.
          gltf.scene.traverse((o) => {
            const mesh = o as unknown as { isMesh?: boolean; material?: { vertexColors?: boolean; metalness?: number; roughness?: number; side?: number; needsUpdate?: boolean } };
            if (mesh.isMesh && mesh.material) {
              mesh.material.vertexColors = true;
              mesh.material.metalness = 0;
              mesh.material.roughness = 1;
              mesh.material.side = THREE.DoubleSide; // on voit l'intérieur de la coque
              mesh.material.needsUpdate = true;
            }
          });
          scene.add(gltf.scene);

          // CAMÉRA À L'INTÉRIEUR : le mesh HunyuanWorld est une coque autour du point de
          // vue. On place la caméra au CENTRE du volume (sinon on voit la coque de dehors,
          // = boule chiffonnée). On regarde vers l'avant ; le déplacement reste dans la pièce.
          const box = new THREE.Box3().setFromObject(gltf.scene);
          const center = box.getCenter(new THREE.Vector3());
          const size = box.getSize(new THREE.Vector3());
          camera.position.copy(center);
          controls.target.copy(center).add(new THREE.Vector3(0, 0, -Math.max(0.001, size.length() * 0.02)));
          controls.minDistance = 0.0001;
          controls.maxDistance = size.length(); // on ne peut pas sortir loin de la coque
          camera.near = Math.max(0.001, size.length() / 5000);
          camera.far = size.length() * 4;
          moveSpeed = Math.max(0.01, size.length() * 0.004);
          camera.updateProjectionMatrix();
          controls.update();
          setStatus('Pièce 3D — glisse pour regarder, pince/molette pour avancer.');
        },
        (p) => { if (p.total) setStatus(`Chargement… ${Math.round((p.loaded / p.total) * 100)}%`); },
        () => { if (!disposed) setStatus('Échec du chargement du mesh 3D.'); },
      );

      const onResize = () => {
        camera.aspect = mount.clientWidth / mount.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(mount.clientWidth, mount.clientHeight);
      };
      window.addEventListener('resize', onResize);

      // Déplacement clavier (desktop) : ZQSD/WASD.
      const keys: Record<string, boolean> = {};
      const kd = (e: KeyboardEvent) => { keys[e.key.toLowerCase()] = true; };
      const ku = (e: KeyboardEvent) => { keys[e.key.toLowerCase()] = false; };
      window.addEventListener('keydown', kd);
      window.addEventListener('keyup', ku);

      const fwd = new THREE.Vector3();
      const animate = () => {
        raf = requestAnimationFrame(animate);
        const speed = moveSpeed;
        camera.getWorldDirection(fwd);
        const right = new THREE.Vector3().crossVectors(fwd, camera.up).normalize();
        if (keys['z'] || keys['w'] || keys['arrowup']) { camera.position.addScaledVector(fwd, speed); controls.target.addScaledVector(fwd, speed); }
        if (keys['s'] || keys['arrowdown']) { camera.position.addScaledVector(fwd, -speed); controls.target.addScaledVector(fwd, -speed); }
        if (keys['q'] || keys['a'] || keys['arrowleft']) { camera.position.addScaledVector(right, -speed); controls.target.addScaledVector(right, -speed); }
        if (keys['d'] || keys['arrowright']) { camera.position.addScaledVector(right, speed); controls.target.addScaledVector(right, speed); }
        controls.update();
        renderer.render(scene, camera);
      };
      animate();

      dispose = () => {
        cancelAnimationFrame(raf);
        window.removeEventListener('resize', onResize);
        window.removeEventListener('keydown', kd);
        window.removeEventListener('keyup', ku);
        controls.dispose();
        renderer.dispose();
        if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
      };
    })();

    return () => { disposed = true; dispose(); };
  }, []);

  return (
    <div className="fixed inset-0 bg-black">
      <div ref={mountRef} className="absolute inset-0" />
      <div className="absolute top-0 inset-x-0 z-10 px-4 py-3 bg-gradient-to-b from-black/70 to-transparent text-white">
        <div className="text-[15px] font-semibold">🧊 Pièce 3D — HunyuanWorld</div>
        <div className="text-[12px] text-white/70 mt-0.5">{status}</div>
      </div>
      <button
        onClick={() => goBack()}
        className="absolute top-3 right-3 z-20 w-9 h-9 rounded-full bg-black/55 backdrop-blur-md border border-white/20 text-white text-lg"
        aria-label="Fermer"
      >×</button>
    </div>
  );
}
