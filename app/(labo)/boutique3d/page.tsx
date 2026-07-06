'use client';

/**
 * Talk2Me — Boutique 3D (Pascal 2026-06-14). Attachée derrière la vitrine du feed.
 * Pièce 3D monochrome : sol + 4 murs sombres, les ARTICLES de la boutique accrochés
 * aux murs, nom de la devanture en haut, porte « Sortir » → retour feed.
 * Aucun emoji, aucune couleur (doctrine monochrome).
 */

import { useEffect, useRef, useState } from 'react';
import { useCart } from '@/lib/boutique-cart-store';
import { formatMoney } from '@/lib/money';
import BoutiqueCart from '@/components/boutique/BoutiqueCart';

export default function Boutique3DPage() {
  const mount = useRef<HTMLDivElement>(null);
  const [name, setName] = useState('Boutique');
  const nameRef = useRef('Boutique');
  const addToCart = useCart((s) => s.add);
  const [added, setAdded] = useState(false);
  const [fiche, setFiche] = useState<{ id: string; image_url: string; label: string; price_cents: number } | null>(null);
  const shopId = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('b') || '' : '';

  useEffect(() => {
    let dispose = () => {};
    (async () => {
      try {
        const THREE = await import('three');
        const { OrbitControls } = await import('three/examples/jsm/controls/OrbitControls.js');
        const el = mount.current!;
        const W = el.clientWidth || window.innerWidth, H = el.clientHeight || window.innerHeight;
        const renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setPixelRatio(Math.min(2, window.devicePixelRatio)); renderer.setSize(W, H);
        renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.85; el.appendChild(renderer.domElement);
        const scene = new THREE.Scene();
        // Galerie premium monochrome : fond dégradé + profondeur
        const gradTex = (c0: string, c1: string, vertical: boolean) => {
          const cv = document.createElement('canvas'); cv.width = cv.height = 256;
          const g = cv.getContext('2d')!;
          const grd = vertical ? g.createLinearGradient(0, 0, 0, 256) : g.createRadialGradient(128, 104, 18, 128, 128, 190);
          grd.addColorStop(0, c0); grd.addColorStop(1, c1); g.fillStyle = grd; g.fillRect(0, 0, 256, 256);
          return new THREE.CanvasTexture(cv);
        };
        // grain procédural (réalisme sol/murs, P1) — léger, 1 canvas
        const noiseTex = (base = 17, amp = 10, rep = 4) => {
          const cv = document.createElement('canvas'); cv.width = cv.height = 256;
          const g = cv.getContext('2d')!; const img = g.createImageData(256, 256);
          for (let i = 0; i < img.data.length; i += 4) {
            const v = base + (Math.random() - 0.5) * amp;
            img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255;
          }
          g.putImageData(img, 0, 0);
          const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep, rep);
          return t;
        };
        scene.background = gradTex('#17171b', '#09090b', false);
        scene.fog = new THREE.Fog(0x0a0a0c, 13, 30);
        // env MONOCHROME (RoomEnvironment ajoutait des reflets bleus/roses → interdit)
        try {
          const pmrem = new THREE.PMREMGenerator(renderer);
          const envScene = new THREE.Scene(); envScene.background = new THREE.Color(0x202024);
          scene.environment = pmrem.fromScene(envScene, 0.04).texture;
        } catch { /* env optionnel */ }
        const camera = new THREE.PerspectiveCamera(56, W / H, 0.05, 200); camera.position.set(0, 1.7, 7.2);

        const HW = 6, WH = 5.2;
        // sol sombre légèrement brillant + grain → reflets feutrés des œuvres
        const floor = new THREE.Mesh(new THREE.PlaneGeometry(HW * 2, HW * 2), new THREE.MeshStandardMaterial({ color: 0x141417, roughness: 0.75, metalness: 0.1, map: noiseTex(20, 2, 5), roughnessMap: noiseTex(128, 16, 5) }));
        floor.rotation.x = -Math.PI / 2; scene.add(floor);
        // murs : dégradé vertical doux
        const wallMat = new THREE.MeshStandardMaterial({ map: gradTex('#2a2a30', '#161619', true), roughness: 0.95 });
        const wallGeo = new THREE.PlaneGeometry(HW * 2, WH);
        const mk = (x: number, z: number, ry: number) => { const m = new THREE.Mesh(wallGeo, wallMat); m.position.set(x, WH / 2, z); m.rotation.y = ry; scene.add(m); };
        mk(0, -HW, 0); mk(-HW, 0, Math.PI / 2); mk(HW, 0, -Math.PI / 2); mk(0, HW, Math.PI);
        // plafond sombre (ferme la pièce, plus de vide en haut)
        const ceil = new THREE.Mesh(new THREE.PlaneGeometry(HW * 2, HW * 2), new THREE.MeshStandardMaterial({ color: 0x0c0c0e, roughness: 1 }));
        ceil.rotation.x = Math.PI / 2; ceil.position.y = WH; scene.add(ceil);

        // ambiance douce + spots de galerie sur chaque mur d'œuvres
        scene.add(new THREE.HemisphereLight(0xffffff, 0x101014, 0.75));
        const amb = new THREE.PointLight(0xffffff, 0.35, 40); amb.position.set(0, WH - 0.4, 0); scene.add(amb);
        const spot = (x: number, y: number, z: number, tx: number, ty: number, tz: number) => {
          const s = new THREE.SpotLight(0xffffff, 4, 18, 0.6, 0.8, 1.4);
          s.position.set(x, y, z); s.target.position.set(tx, ty, tz);
          scene.add(s); scene.add(s.target);
        };
        spot(0, WH - 0.6, -2, 0, 2.7, -HW);   // mur du fond
        spot(-2, WH - 0.6, 0, -HW, 2.7, 0);   // mur gauche
        spot(2, WH - 0.6, 0, HW, 2.7, 0);     // mur droit

        const controls = new OrbitControls(camera, renderer.domElement);
        controls.target.set(0, 1.5, 0); controls.enablePan = false;
        controls.minDistance = 2; controls.maxDistance = 9;
        controls.minPolarAngle = 0.7; controls.maxPolarAngle = Math.PI / 2.05; // reste droit, pas sous le sol
        controls.rotateSpeed = 0.45; controls.enableDamping = true; controls.dampingFactor = 0.16;
        controls.update();
        renderer.domElement.style.touchAction = 'none';

        const loader = new THREE.TextureLoader();
        const TW = 1.7, TH = TW; // articles carrés
        const WI = HW - 0.07;
        // p(xo, y) : xo = décalage horizontal (centré), y = hauteur
        const walls: { p: (xo: number, y: number) => [number, number, number]; rot: [number, number, number]; inn: [number, number, number] }[] = [
          { p: (xo, y) => [xo, y, -WI], rot: [0, 0, 0], inn: [0, 0, 0.03] },
          { p: (xo, y) => [-WI, y, xo], rot: [0, Math.PI / 2, 0], inn: [0.03, 0, 0] },
          { p: (xo, y) => [WI, y, -xo], rot: [0, -Math.PI / 2, 0], inn: [-0.03, 0, 0] },
        ];
        // étiquette texte (nom + prix) sous l'article
        const mkLabel = (text: string) => {
          const S = 2; const c = document.createElement('canvas'); c.width = 420 * S; c.height = 84 * S;
          const x = c.getContext('2d')!; x.scale(S, S);
          x.fillStyle = '#ececed';
          if (typeof x.roundRect === 'function') { x.beginPath(); x.roundRect(42, 16, 336, 52, 11); x.fill(); }
          else x.fillRect(42, 16, 336, 52);
          x.fillStyle = '#141416'; x.font = '600 25px system-ui'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text.slice(0, 26), 210, 43);
          return new THREE.Mesh(new THREE.PlaneGeometry(TW * 1.05, TW * 1.05 * 84 / 420), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true }));
        };
        const clickable: any[] = [];
        fetch('/api/simple-shop/' + shopId + '/vitrine', { cache: 'no-store' }).then((r) => r.json()).then((d) => {
          if (d?.name) { setName(d.name); nameRef.current = d.name; }
          const items = (d?.items || []).filter((it: any) => it.image_url);
          const PERWALL = 8, COLS = 4, SP = 2.4; const ROWY = [3.2, 1.2];
          let i = 0;
          for (const w of walls) {
            if (i >= items.length) break;
            const nWall = Math.min(PERWALL, items.length - i);
            for (let j = 0; j < nWall; j++) {
            const it = items[i]; i++;
            const r = Math.floor(j / COLS);
            const inRow = Math.min(COLS, nWall - r * COLS); // articles sur CETTE rangée → centrage
            const col = j - r * COLS;
            const xo = (col - (inRow - 1) / 2) * SP;
            const y = ROWY[r] ?? ROWY[ROWY.length - 1];
            const [x, , z] = w.p(xo, y);
            // cadre + passe + œuvre créés APRÈS chargement → on connaît le VRAI ratio
            // de la photo (4:3, portrait…) et on évite l'écrasement. Tout tient dans une boîte TW.
            loader.load(it.image_url, (tex) => {
              tex.colorSpace = THREE.SRGBColorSpace;
              const im = tex.image as { width?: number; height?: number } | undefined;
              const ar = im && im.width && im.height ? im.width / im.height : 1;
              let iw = TW, ih = TW; if (ar >= 1) ih = TW / ar; else iw = TW * ar;
              const frame = new THREE.Mesh(new THREE.PlaneGeometry(iw + 0.2, ih + 0.2), new THREE.MeshStandardMaterial({ color: 0x070708, roughness: 0.45, metalness: 0.35 }));
              frame.position.set(x, y, z); frame.rotation.set(...w.rot); scene.add(frame);
              const passe = new THREE.Mesh(new THREE.PlaneGeometry(iw + 0.09, ih + 0.09), new THREE.MeshStandardMaterial({ color: 0xececed, roughness: 0.85 }));
              passe.position.set(x + w.inn[0] * 0.5, y + w.inn[1] * 0.5, z + w.inn[2] * 0.5); passe.rotation.set(...w.rot); scene.add(passe);
              const s = new THREE.Mesh(new THREE.PlaneGeometry(iw, ih), new THREE.MeshBasicMaterial({ map: tex }));
              s.position.set(x + w.inn[0], y + w.inn[1], z + w.inn[2]); s.rotation.set(...w.rot);
              s.userData.item = { id: it.id, image_url: it.image_url, label: it.label || '', price_cents: it.price_cents };
              clickable.push(s); scene.add(s);
              const price = it.price_cents ? formatMoney(it.price_cents) : '';
              const txt = [it.label, price].filter(Boolean).join('  ·  ');
              if (txt) { const lab = mkLabel(txt); lab.position.set(x + w.inn[0], y - ih / 2 - 0.22, z + w.inn[2]); lab.rotation.set(...w.rot); scene.add(lab); }
            });
          } }
        }).catch(() => {});

        // clic sur un article → fiche article (on ignore les drags de caméra)
        const ray = new THREE.Raycaster(); const ndc = new THREE.Vector2();
        let downX = 0, downY = 0, downT = 0;
        const onDown = (e: PointerEvent) => { downX = e.clientX; downY = e.clientY; downT = Date.now(); };
        const onUp = (e: PointerEvent) => {
          if (Date.now() - downT > 500) return;
          if (Math.abs(e.clientX - downX) > 8 || Math.abs(e.clientY - downY) > 8) return;
          const rect = renderer.domElement.getBoundingClientRect();
          ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
          ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
          ray.setFromCamera(ndc, camera);
          const hit = ray.intersectObjects(clickable, false)[0];
          if (hit) setFiche((hit.object as any).userData.item);
        };
        renderer.domElement.addEventListener('pointerdown', onDown);
        renderer.domElement.addEventListener('pointerup', onUp);

        let raf = 0; const loop = () => { controls.update(); renderer.render(scene, camera); raf = requestAnimationFrame(loop); }; loop();
        const onR = () => { const w = el.clientWidth, h = el.clientHeight; camera.aspect = w / h; camera.updateProjectionMatrix(); renderer.setSize(w, h); };
        window.addEventListener('resize', onR);
        dispose = () => { cancelAnimationFrame(raf); window.removeEventListener('resize', onR); renderer.domElement.removeEventListener('pointerdown', onDown); renderer.domElement.removeEventListener('pointerup', onUp); renderer.dispose(); el.innerHTML = ''; };
      } catch { /* */ }
    })();
    return () => dispose();
  }, [shopId]);

  return (
    <main style={{ position: 'fixed', inset: 0, background: '#0d0d0f', overflow: 'hidden', touchAction: 'none' }}>
      <div ref={mount} style={{ position: 'absolute', inset: 0 }} />
      <div style={{ position: 'fixed', top: 14, left: '50%', transform: 'translateX(-50%)', zIndex: 6, padding: '8px 18px', borderRadius: 14, background: 'rgba(255,255,255,.08)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,.18)', color: '#fff', fontFamily: 'system-ui', fontSize: 17, fontWeight: 800, letterSpacing: 0.4 }}>{name}</div>
      <button onClick={() => { location.assign('/home'); }}
        style={{ position: 'fixed', top: 14, right: 14, zIndex: 6, width: 56, height: 96, border: 0, background: 'transparent', padding: 0 }}>
        <span style={{ position: 'absolute', inset: 0, borderRadius: '8px 8px 3px 3px', background: 'linear-gradient(#3a3a3a,#1f1f1f)', boxShadow: '0 8px 22px rgba(0,0,0,.5)' }} />
        <span style={{ position: 'absolute', inset: 4, borderRadius: '6px 6px 2px 2px', background: 'linear-gradient(160deg,#2a2a2a,#141414)', border: '1px solid rgba(255,255,255,.08)' }} />
        <span style={{ position: 'absolute', right: 10, top: 46, width: 7, height: 7, borderRadius: 999, background: '#cfcfcf' }} />
        <span style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', bottom: -20, whiteSpace: 'nowrap', padding: '3px 10px', borderRadius: 999, background: 'rgba(0,0,0,.6)', color: '#fff', fontFamily: 'system-ui', fontSize: 12, fontWeight: 700 }}>Sortir</span>
      </button>

      {/* FICHE ARTICLE (clic sur un article) — monochrome */}
      {fiche && (
        <div onClick={() => setFiche(null)} style={{ position: 'fixed', inset: 0, zIndex: 20, background: 'rgba(0,0,0,.72)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', fontFamily: 'system-ui' }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 460, background: '#161618', borderTopLeftRadius: 22, borderTopRightRadius: 22, border: '1px solid rgba(255,255,255,.1)', padding: 18, paddingBottom: 'calc(env(safe-area-inset-bottom) + 22px)' }}>
            <div style={{ width: 38, height: 4, borderRadius: 999, background: 'rgba(255,255,255,.25)', margin: '0 auto 16px' }} />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={fiche.image_url} alt="" style={{ width: '100%', aspectRatio: '1/1', objectFit: 'cover', borderRadius: 16, background: '#0d0d0f' }} />
            <div style={{ color: '#fff', fontSize: 19, fontWeight: 800, marginTop: 14, lineHeight: 1.25 }}>{fiche.label || 'Article'}</div>
            {!!fiche.price_cents && (
              <div style={{ color: '#fff', fontSize: 22, fontWeight: 800, marginTop: 6 }}>{formatMoney(fiche.price_cents)}</div>
            )}
            <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
              <button onClick={() => setFiche(null)} style={{ flex: '0 0 auto', padding: '14px 18px', borderRadius: 14, border: '1px solid rgba(255,255,255,.18)', background: 'transparent', color: '#fff', fontSize: 15, fontWeight: 700 }}>Fermer</button>
              <button
                onClick={() => {
                  const price = fiche.price_cents ? formatMoney(fiche.price_cents) : '';
                  addToCart(shopId, nameRef.current, { productId: fiche.id, title: fiche.label || 'Article', priceLabel: price, imageUrl: fiche.image_url || null });
                  setAdded(true); setTimeout(() => setAdded(false), 1400);
                  setFiche(null);
                }}
                style={{ flex: 1, padding: '14px 18px', borderRadius: 14, border: 0, background: '#fff', color: '#111', fontSize: 15, fontWeight: 800 }}
              >Ajouter au panier</button>
            </div>
          </div>
        </div>
      )}

      {added && (
        <div style={{ position: 'fixed', left: '50%', bottom: 'calc(env(safe-area-inset-bottom) + 96px)', transform: 'translateX(-50%)', zIndex: 70, padding: '10px 16px', borderRadius: 999, background: 'rgba(255,255,255,.92)', color: '#111', fontFamily: 'system-ui', fontSize: 13, fontWeight: 700, boxShadow: '0 8px 24px rgba(0,0,0,.4)' }}>Ajouté au panier</div>
      )}

      {shopId && <BoutiqueCart shopId={shopId} />}
    </main>
  );
}
