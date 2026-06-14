'use client';

/**
 * Talk2Me — LeaInSpace (Pascal 2026-06-13).
 * AR d'ancrage SANS WebXR (mort sur l'appareil) : on pilote la caméra 3D avec le
 * GYROSCOPE du téléphone (DeviceOrientation). Léa est posée à un POINT FIXE du sol
 * du monde. Quand tu bouges/inclines le téléphone, la caméra tourne d'autant →
 * Léa RESTE AU SOL (tu vises le plafond → elle sort du cadre par le bas, elle ne
 * monte pas). Rendu transparent par-dessus ta vraie caméra (ton salon filmé).
 * Repli : si pas de gyro/permission refusée → orbite au doigt.
 */

import { useEffect, useRef, useState } from 'react';

export default function LeaInSpace() {
  const mount = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState('Bouge ton téléphone pour regarder autour 📱');

  useEffect(() => {
    let dispose = () => {};
    (async () => {
     try {
      const THREE = await import('three');
      const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
      const { OrbitControls } = await import('three/examples/jsm/controls/OrbitControls.js');

      const el = mount.current!;
      const W = el.clientWidth || window.innerWidth, H = el.clientHeight || window.innerHeight;
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
      renderer.setSize(W, H);
      renderer.setClearColor(0x000000, 0); // TRANSPARENT → on voit ta vraie caméra derrière
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.domElement.style.touchAction = 'none';
      el.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      scene.background = null;
      // Caméra à hauteur d'yeux, POSITION FIXE ; c'est sa ROTATION que le gyro pilote.
      const camera = new THREE.PerspectiveCamera(60, W / H, 0.05, 100);
      camera.position.set(0, 1.5, 0);

      // SOL INVISIBLE qui ne capte QUE l'ombre → Léa a l'air posée sur TON sol réel
      const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.ShadowMaterial({ opacity: 0.4 }));
      ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);

      scene.add(new THREE.HemisphereLight(0xffffff, 0x404048, 1.0));
      const key = new THREE.DirectionalLight(0xffffff, 2.2);
      key.position.set(2.5, 6, 3); key.castShadow = true;
      key.shadow.mapSize.set(1024, 1024);
      key.shadow.camera.near = 0.5; key.shadow.camera.far = 30;
      (key.shadow.camera as any).left = -5; (key.shadow.camera as any).right = 5;
      (key.shadow.camera as any).top = 5; (key.shadow.camera as any).bottom = -5;
      scene.add(key);

      let lea: any = null, mixer: any = null;
      new GLTFLoader().load('/uploads/9f6139bc-b014-4817-9248-ce92e3872aba.glb', (g) => {
        const m = g.scene; m.traverse((o: any) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
        const box = new THREE.Box3().setFromObject(m);
        const c = box.getCenter(new THREE.Vector3());
        m.position.x -= c.x; m.position.z -= c.z; m.position.y -= box.min.y; // pieds au sol (y=0)
        // posée DEVANT, au sol, à ~2,6 m (point fixe du monde)
        m.position.z = -2.6;
        scene.add(m); lea = m;
        if (g.animations?.length) { mixer = new THREE.AnimationMixer(m); mixer.clipAction(g.animations[0]).play(); }
      }, undefined, () => setStatus('Avatar indisponible.'));

      // --- GYRO : oriente la caméra comme le téléphone (ancre la scène au monde) ---
      const zee = new THREE.Vector3(0, 0, 1);
      const q0 = new THREE.Quaternion();
      const q1 = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5)); // regarde "hors" du dos du tel
      const euler = new THREE.Euler();
      const orient = () => ((screen.orientation?.angle ?? (window as any).orientation ?? 0) as number) * Math.PI / 180;
      let last: { a: number; b: number; c: number } | null = null;
      let alpha0: number | null = null; // cap initial → Léa centrée au départ
      const deg = Math.PI / 180;
      const onOrient = (e: DeviceOrientationEvent) => {
        if (e.alpha == null || e.beta == null || e.gamma == null) return;
        if (alpha0 == null) alpha0 = e.alpha * deg; // mémorise le cap de départ
        last = { a: e.alpha * deg - (alpha0 || 0), b: e.beta * deg, c: e.gamma * deg };
        if (!gyroActive) { gyroActive = true; controls.enabled = false; setStatus('Léa est posée au sol — bouge ton téléphone autour d’elle 🧍'); }
      };
      let gyroActive = false;
      const applyGyro = () => {
        if (!last) return;
        euler.set(last.b, last.a, -last.c, 'YXZ');
        camera.quaternion.setFromEuler(euler);
        camera.quaternion.multiply(q1);
        camera.quaternion.multiply(q0.setFromAxisAngle(zee, -orient()));
      };

      // Repli orbite au doigt (si pas de gyro)
      const controls = new OrbitControls(camera, renderer.domElement);
      controls.target.set(0, 1.0, -2.6); controls.enablePan = false;
      controls.minDistance = 0.5; controls.maxDistance = 6; controls.maxPolarAngle = Math.PI / 2;
      controls.enableDamping = true; controls.update();

      const DOE: any = (window as any).DeviceOrientationEvent;
      if (DOE && typeof DOE.requestPermission === 'function') {
        DOE.requestPermission().then((s: string) => { if (s === 'granted') window.addEventListener('deviceorientation', onOrient, true); }).catch(() => {});
      } else if (DOE) {
        window.addEventListener('deviceorientation', onOrient, true);
      }
      // si aucun event gyro après 1,5 s → on laisse l'orbite au doigt active
      const fallbackT = setTimeout(() => { if (!gyroActive) setStatus('Pas de gyroscope ici — glisse au doigt pour tourner autour'); }, 1500);

      const clock = new THREE.Clock();
      let raf = 0;
      const loop = () => {
        const d = clock.getDelta(); if (mixer) mixer.update(d);
        if (gyroActive) applyGyro(); else controls.update();
        renderer.render(scene, camera); raf = requestAnimationFrame(loop);
      };
      loop();
      const onResize = () => { const w = el.clientWidth, h = el.clientHeight; camera.aspect = w / h; camera.updateProjectionMatrix(); renderer.setSize(w, h); };
      window.addEventListener('resize', onResize);
      dispose = () => { cancelAnimationFrame(raf); clearTimeout(fallbackT); window.removeEventListener('resize', onResize); window.removeEventListener('deviceorientation', onOrient, true); renderer.dispose(); el.innerHTML = ''; };
     } catch (e) { setStatus('Erreur 3D: ' + (((e as Error)?.message) || String(e))); }
    })();
    return () => dispose();
  }, []);

  return (
    <>
      <div ref={mount} className="absolute inset-0 z-[14]" />
      {status && (
        <div className="absolute top-12 left-2 right-12 z-30 text-[11px] text-white bg-black/55 px-2 py-1 rounded-full pointer-events-none">{status}</div>
      )}
    </>
  );
}
