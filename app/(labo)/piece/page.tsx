'use client';

/**
 * Talk2Me — PIÈCE-POST (Pascal 2026-06-13).
 * Un post = une PIÈCE dans laquelle on entre (porte du feed → ici). Scène 3D :
 * sol + murs + Léa (GLB) + ta playlist YouTube accrochée aux murs ; on regarde
 * autour au doigt (orbit) et on tape une pochette → la vidéo joue sur le mur.
 * Page autonome (atteinte UNIQUEMENT par la porte du feed). Indépendante de la
 * caméra du composer (qui, elle, pose Léa dans ton salon réel via le gyro).
 */

import { useEffect, useRef, useState } from 'react';
import { useFeatureGate } from '@/lib/client/use-feature';
import { goBack, exitToFeedPost } from '@/lib/client/go-back';
import DevOnly from '@/components/system/DevOnly';
import { buildRoomFurniture } from './furniture';
import LiveComments from '@/components/live/LiveComments';
import LiveProducts from '@/components/live/LiveProducts';
import LiveProductPicker from '@/components/live/LiveProductPicker';

export default function PiecePage() {
  // Pièces 3D sous interrupteur admin (parqué Mada / allumable international). Pascal 2026-06-21.
  const piece3dGate = useFeatureGate('piece3d');
  const mount = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState('Entrée dans la pièce…');
  const [playing, setPlaying] = useState<{ id: string; title: string } | null>(null);
  const closeWallRef = useRef<() => void>(() => {});
  const leaActRef = useRef<(a: string) => void>(() => {});
  const animPlayRef = useRef<(f: string) => void>(() => {});
  const liveRef = useRef<(on: boolean) => void>(() => {});
  const speakRef = useRef(0); // timestamp (s) jusqu'où l'IA "parle" → gestes Streamoji
  const seeRef = useRef<() => void>(() => {}); // déclenche la PERCEPTION (vue 1re personne)
  const [seeBusy, setSeeBusy] = useState(false);
  const [live, setLive] = useState(false);
  // Le propriétaire de CETTE salle est-il EN DIRECT ? (spectateur → overlay commentaires)
  const [watchLiveId, setWatchLiveId] = useState<string | null>(null);
  const [animPanel, setAnimPanel] = useState(false);
  const [animList, setAnimList] = useState<{ name: string }[]>([]);
  const openAnimPanel = async () => {
    try { const d = await (await fetch('/api/anim', { cache: 'no-store' })).json(); setAnimList((d.files || []).filter((f: any) => /\.(fbx|glb)$/i.test(f.name) && f.name !== 'mocap-soldier.glb')); } catch { /* */ }
    setAnimPanel(true);
  };
  const [cmd, setCmd] = useState('');
  const [leaSay, setLeaSay] = useState('');   // réponse de TON IA (même que le chat)
  const [busy, setBusy] = useState(false);
  const [aiName, setAiName] = useState('Léa'); // nom de l'IA choisi dans le profil
  const [isMyRoom, setIsMyRoom] = useState(false); // outils avatar visibles SEULEMENT dans MA salle
  // HUB de pièces : chaque post du feed = une salle, navigables dans l'ordre + carte GTA
  const [rooms, setRooms] = useState<{ id: string; userId: string; name: string; avatar: string; caption?: string; media_url?: string; _friend?: boolean }[]>([]);
  const [mapOpen, setMapOpen] = useState(false);
  const roomIdx = typeof window !== 'undefined' ? (parseInt(new URLSearchParams(window.location.search).get('i') || '0', 10) || 0) : 0;
  const roomU = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('u') : null;
  const curIndex = roomU && rooms.length ? Math.max(0, rooms.findIndex((r) => r.userId === roomU)) : roomIdx;
  useEffect(() => {
    (async () => {
      try {
        // voisins proches = AMIS d'abord, puis les autres ; 1 SALLE = 1 USER (dédup par auteur)
        const [fr, al] = await Promise.all([
          fetch('/api/posts?limit=60&offset=0&scope=friends', { cache: 'no-store' }).then((r) => r.json()).catch(() => ({})),
          fetch('/api/posts?limit=60&offset=0&scope=all', { cache: 'no-store' }).then((r) => r.json()).catch(() => ({})),
        ]);
        const tag = (arr: any[], fr2: boolean) => (arr || []).filter((it: any) => it && it.id).map((it: any) => ({ ...it, _friend: fr2 }));
        const all = [...tag(fr.items, true), ...tag(al.items, false)];
        const seen = new Set<string>(); const out: any[] = [];
        for (const it of all) { const a = it.author || {}; const uid = a.id || it.user_id; if (!uid || seen.has(uid)) continue; seen.add(uid); out.push({ id: it.id, userId: uid, name: a.display_name || a.username || 'Utilisateur', avatar: a.avatar_url || '', caption: it.caption, media_url: it.media_url, _friend: it._friend }); }
        setRooms(out);
      } catch { /* */ }
    })();
  }, []);
  const goRoom = (i: number) => { if (rooms.length) { const n = (i % rooms.length + rooms.length) % rooms.length; location.assign('/piece?u=' + rooms[n].userId); } };

  // LA VOIX : synthèse TTS (notre GPU) jouée dans la pièce → l'avatar parle.
  // Cale aussi la durée des gestes sur la vraie durée audio.
  async function speak(text: string) {
    const t = (text || '').trim(); if (!t) return;
    try {
      const r = await fetch('/api/avatar/voice', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: t }) });
      const j = await r.json();
      if (!j?.url) return;
      const a = new Audio(j.url);
      a.onloadedmetadata = () => { if (isFinite(a.duration) && a.duration > 0) speakRef.current = performance.now() / 1000 + a.duration; };
      a.play().catch(() => {});
    } catch { /* voix indispo */ }
  }

  // LES OREILLES : enregistre ~5 s de micro → notre GPU /stt → texte → elle répond.
  async function listen() {
    if (seeBusy) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
        const b64: string = await new Promise((res) => { const fr = new FileReader(); fr.onloadend = () => res(String(fr.result || '').split(',')[1] || ''); fr.readAsDataURL(blob); });
        if (!b64) return;
        setLeaSay('…');
        try {
          const r = await fetch('/api/avatar/hear', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ audio_b64: b64 }) });
          const j = await r.json();
          if (j?.text) tellLea(j.text); else setLeaSay('');
        } catch { setLeaSay(''); }
      };
      rec.start();
      setLeaSay('🎤 je t’écoute…');
      setTimeout(() => { try { rec.stop(); } catch { /* */ } }, 5000);
    } catch { setLeaSay('Micro refusé.'); }
  }

  // On lui PARLE, elle COMPREND (même cerveau que le chat). AUCUNE action
  // hard-codée, aucun déclencheur sur mots-clés — l'IA décide.
  async function tellLea(text: string) {
    const t = text.trim(); if (!t) return;
    setCmd(''); setBusy(true); setLeaSay('');
    try {
      const r = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: t }) });
      const j = await r.json();
      const reply = (j?.text || '').trim();
      if (reply) {
        setLeaSay(reply);
        // l'IA "parle" → durée estimée (recalée par la vraie durée audio dans speak())
        speakRef.current = performance.now() / 1000 + Math.min(9, Math.max(2.5, reply.length / 14));
        speak(reply); // 🗣️ sa voix
      }
      else if (act) setLeaSay('');
    } catch { /* silencieux */ } finally { setBusy(false); }
  }

  useEffect(() => {
    if (piece3dGate !== 'on') return; // feature éteinte : on ne monte pas le moteur 3D
    let dispose = () => {};
    (async () => {
     try {
      setStatus('Chargement du moteur 3D…');
      const THREE = await import('three');
      const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
      const { OrbitControls } = await import('three/examples/jsm/controls/OrbitControls.js');
      const { CSS3DRenderer, CSS3DObject } = await import('three/examples/jsm/renderers/CSS3DRenderer.js');
      const { startBroadcast, startViewer } = await import('@/lib/live/p2p');
      setStatus('Construction de la pièce…');

      // AVATAR selon le GENRE de l'IA + mon user id (pour le live)
      // Override direct : /piece?avatar=/uploads/xxx.glb → on charge CE modèle (test/démo,
      // ex. le scan 3D perso). Si présent, on saute la résolution auto. Pascal 2026-06-21.
      const avatarOverride = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('avatar') : null;
      let glbUrl = avatarOverride || '/uploads/lea-body.glb'; // défaut (anciens 9f61.../avatar-male = 404)
      let meId = '';
      // Streamoji (Pascal 2026-06-17) : si le user a créé un CORPS RÉALISTE via
      // /avatar-studio, on le charge en priorité. Rig standard (Hips/Spine/Neck/
      // Head…) + blendshapes ARKit → animation/drive gérés par le bloc Streamoji.
      let isStreamoji = false;
      try {
        // cache-bust URL unique : défait un éventuel vieux Service Worker qui
        // servirait un /api/auth/me PÉRIMÉ (sans le corps). (Pascal 2026-06-18)
        const me = await (await fetch('/api/auth/me?t=' + Date.now(), { cache: 'no-store' })).json();
        meId = me?.user?.id || '';
        const gender = me?.user?.ai_gender || 'neutre';
        sGender = gender === 'masculin' ? 'm' : 'f';
        if (me?.user?.ai_name) setAiName(me.user.ai_name);
        // (pas de GLB masculin générique dispo → on garde lea-body par défaut ;
        //  le vrai corps perso vient de ai_avatar_body_url ci-dessous)
        if (me?.user?.ai_avatar_body_url) {
          glbUrl = me.user.ai_avatar_body_url; // corps réaliste Streamoji (prioritaire)
          isStreamoji = true;
        } else if (me?.user?.ai_avatar_url) {
          // PAS encore de corps mais une PHOTO DE PROFIL IA → on génère le corps
          // par défaut À PARTIR de cette photo (Pascal 2026-06-17).
          try {
            setStatus('Création de l’avatar depuis la photo…');
            const gen = await (await fetch('/api/avatar/streamoji/from-profile-photo', { method: 'POST' })).json();
            if (gen?.url) { glbUrl = gen.url; isStreamoji = true; }
          } catch { /* on garde le défaut */ }
        }
      } catch { /* défaut féminin */ }

      const el = mount.current!;
      const W = el.clientWidth || window.innerWidth, H = el.clientHeight || window.innerHeight;
      const cssRenderer = new CSS3DRenderer();
      cssRenderer.setSize(W, H);
      cssRenderer.domElement.style.position = 'absolute';
      cssRenderer.domElement.style.top = '0';
      cssRenderer.domElement.style.left = '0';
      cssRenderer.domElement.style.zIndex = '0';
      cssRenderer.domElement.style.pointerEvents = 'none';
      el.appendChild(cssRenderer.domElement);
      const cssScene = new THREE.Scene();
      const PX_W = 640, PX_H = 360;

      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
      renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
      renderer.setSize(W, H);
      renderer.setClearColor(0x000000, 0);
      renderer.shadowMap.enabled = true;
      renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.9;
      renderer.domElement.style.position = 'absolute';
      renderer.domElement.style.inset = '0';
      renderer.domElement.style.zIndex = '1';
      el.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      scene.background = null;
      scene.fog = new THREE.Fog(0x15151c, 13, 30); // profondeur
      try {
        const pmrem = new THREE.PMREMGenerator(renderer);
        const envScene = new THREE.Scene(); envScene.background = new THREE.Color(0x202024);
        scene.environment = pmrem.fromScene(envScene, 0.04).texture; // env MONOCHROME (pas de teinte)
      } catch { /* env optionnel */ }
      const camera = new THREE.PerspectiveCamera(58, W / H, 0.05, 200);
      camera.position.set(0, 1.7, 7.2);

      const HW = 6, WH = 5.2; // pièce plus grande (12×12) et plus haute (5,2 m)
      const room = new THREE.Group();
      const noiseTex = (base: number, amp: number, rep: number) => {
        const cv = document.createElement('canvas'); cv.width = cv.height = 256;
        const g = cv.getContext('2d')!; const img = g.createImageData(256, 256);
        for (let i = 0; i < img.data.length; i += 4) { const v = base + (Math.random() - 0.5) * amp; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; }
        g.putImageData(img, 0, 0); const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep, rep); return t;
      };
      const floorMat = new THREE.MeshStandardMaterial({ color: 0x16161a, roughness: 0.75, metalness: 0.1, map: noiseTex(20, 2, 6), roughnessMap: noiseTex(128, 16, 6) });
      const wallMat = new THREE.MeshStandardMaterial({ color: 0x2c2c34, roughness: 0.9, metalness: 0.1 });
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(HW * 2, HW * 2), floorMat);
      floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; room.add(floor);
      const wallGeo = new THREE.PlaneGeometry(HW * 2, WH);
      const back = new THREE.Mesh(wallGeo, wallMat); back.position.set(0, WH / 2, -HW); room.add(back);
      const left = new THREE.Mesh(wallGeo, wallMat); left.position.set(-HW, WH / 2, 0); left.rotation.y = Math.PI / 2; room.add(left);
      const right = new THREE.Mesh(wallGeo, wallMat); right.position.set(HW, WH / 2, 0); right.rotation.y = -Math.PI / 2; room.add(right);
      const front = new THREE.Mesh(wallGeo, wallMat); front.position.set(0, WH / 2, HW); front.rotation.y = Math.PI; room.add(front);
      scene.add(room);
      // Mobilier (Phase 2.2) : canapé, table, tapis, lampadaire chaud, plante, étagère.
      try { scene.add(buildRoomFurniture(THREE)); } catch (e) { console.warn('furniture', e); }

      // 4 PORTES, une par mur : Entrée · Sortie · Voisin gauche · Voisin droite
      let roomCount = 0, idx3d = roomIdx; let roomList: any[] = [];
      const doors: any[] = [];
      const doorGroups: Record<string, any> = {};
      const mkLabel = (text: string) => {
        const S = 2; const c = document.createElement('canvas'); c.width = 256 * S; c.height = 64 * S;
        const x = c.getContext('2d')!; x.scale(S, S); x.fillStyle = 'rgba(0,0,0,.55)'; x.fillRect(0, 0, 256, 64);
        x.fillStyle = '#fff'; x.font = '600 30px system-ui'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text, 128, 34);
        const m = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.28), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true }));
        m.position.set(0, 1.25, 0.04); return m;
      };
      const makeDoor = (kind: string, label: string, px: number, py: number, pz: number, ry: number) => {
        const g = new THREE.Group();
        const frame = new THREE.Mesh(new THREE.PlaneGeometry(1.25, 2.55), new THREE.MeshStandardMaterial({ color: 0x8a6a45, roughness: 0.7 }));
        const panel = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 2.4), new THREE.MeshStandardMaterial({ color: 0x4a3320, roughness: 0.6 }));
        panel.position.z = 0.02; panel.userData = { side: kind };
        const handle = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 12), new THREE.MeshStandardMaterial({ color: 0xf4d58d, emissive: 0x6b5316, emissiveIntensity: 0.6 }));
        handle.position.set(0.4, 0, 0.06);
        const lab = mkLabel(label); lab.position.set(0, 1.5, 0.04);
        g.add(frame, panel, handle, lab);
        g.position.set(px, py, pz); g.rotation.y = ry; scene.add(g); doors.push(panel); doorGroups[kind] = g;
      };
      const DI = HW - 0.05, LO = HW - 1.4; // porte collée au mur, décalée vers un coin → centre libre
      makeDoor('prev', '◀ Voisin', -DI, 1.28, LO, Math.PI / 2);    // mur gauche, côté avant
      makeDoor('next', 'Voisin ▶', DI, 1.28, -LO, -Math.PI / 2);    // mur droit, côté arrière
      makeDoor('entree', 'Entrée', LO, 1.28, DI, Math.PI);          // mur devant, à gauche
      makeDoor('sortie', 'Sortie', -LO, 1.28, -DI, 0);             // mur du fond, à gauche (photo au centre)

      const loader = new THREE.TextureLoader();
      const TW = 1.45, TH = TW * 9 / 16;
      const WI = HW - 0.07; // juste devant le mur
      const walls = [
        { pos: (c: number, r: number): [number, number, number] => [(c - 1) * 2.2, 3.1 - r * 1.25, -WI], rot: [0, 0, 0] as [number, number, number], inn: [0, 0, 0.03] as [number, number, number] },
        { pos: (c: number, r: number): [number, number, number] => [-WI, 3.1 - r * 1.25, (c - 1) * 2.2], rot: [0, Math.PI / 2, 0] as [number, number, number], inn: [0.03, 0, 0] as [number, number, number] },
        { pos: (c: number, r: number): [number, number, number] => [WI, 3.1 - r * 1.25, -(c - 1) * 2.2], rot: [0, -Math.PI / 2, 0] as [number, number, number], inn: [-0.03, 0, 0] as [number, number, number] },
      ];
      const clickable: any[] = [];
      // accroche une image (post du user) à un emplacement de mur
      const hangImage = (url: string, w: any, c: number, r: number) => {
        const [x, y, z] = w.pos(c, r);
        const frame = new THREE.Mesh(new THREE.PlaneGeometry(TW + 0.08, TH + 0.08), new THREE.MeshStandardMaterial({ color: 0x070709, emissive: 0x111118, emissiveIntensity: 0.4 }));
        frame.position.set(x, y, z); frame.rotation.set(...w.rot); scene.add(frame);
        loader.load(url, (tex) => {
          const scr = new THREE.Mesh(new THREE.PlaneGeometry(TW, TH), new THREE.MeshBasicMaterial({ map: tex }));
          scr.position.set(x + w.inn[0], y + w.inn[1], z + w.inn[2]); scr.rotation.set(...w.rot);
          scene.add(scr);
        });
      };

      // mur de son du PROPRIÉTAIRE (rempli plus bas, une fois cur connu)
      const fillSoundWall = (ownerUid: string) => {
        fetch('/api/music-wall?mode=top&limit=4&user=' + encodeURIComponent(ownerUid)).then((r) => r.json()).then((d) => {
          const tracks: { id: string; title: string; thumb: string }[] = d.tracks || [];
          const rot: [number, number, number] = [0, -Math.PI / 2, 0], inn: [number, number, number] = [-0.03, 0, 0];
          const MW = 2.7, MH = MW * 9 / 16;
          for (let k = 0; k < 4; k++) {
            const t = tracks[k]; if (!t) break;
            const c = k % 2, r = Math.floor(k / 2);
            const x = WI, y = 3.2 - r * 1.75, z = c === 0 ? 1.55 : -1.55;
            const frame = new THREE.Mesh(new THREE.PlaneGeometry(MW + 0.1, MH + 0.1), new THREE.MeshStandardMaterial({ color: 0x070709, emissive: 0x111118, emissiveIntensity: 0.4 }));
            frame.position.set(x, y, z); frame.rotation.set(...rot); scene.add(frame);
            loader.load(t.thumb, (tex) => {
              const scr = new THREE.Mesh(new THREE.PlaneGeometry(MW, MH), new THREE.MeshBasicMaterial({ map: tex }));
              scr.position.set(x + inn[0], y + inn[1], z + inn[2]); scr.rotation.set(...rot);
              scr.userData = { ytId: t.id, title: t.title, rot, inn, w: MW, h: MH }; scene.add(scr); clickable.push(scr);
            });
          }
        }).catch(() => {});
      };

      // CONTENU DU POST sur le mur du fond : chaque salle = SON post (image/vidéo/titre)
      (async () => {
        try {
          const [fr, al] = await Promise.all([
            fetch('/api/posts?limit=40&offset=0&scope=friends', { cache: 'no-store' }).then((r) => r.json()).catch(() => ({})),
            fetch('/api/posts?limit=40&offset=0&scope=all', { cache: 'no-store' }).then((r) => r.json()).catch(() => ({})),
          ]);
          // 1 SALLE = 1 USER (dédup par auteur), amis d'abord
          const tag = (arr: any[], f: boolean) => (arr || []).filter((it: any) => it && it.id).map((it: any) => ({ ...it, _friend: f }));
          const seen = new Set<string>(); const list: any[] = [];
          for (const it of [...tag(fr.items, true), ...tag(al.items, false)]) { const a = it.author || {}; const uid = a.id || it.user_id; if (!uid || seen.has(uid)) continue; seen.add(uid); list.push({ uid, postId: it.id, name: a.display_name || a.username || 'Utilisateur', avatar: a.avatar_url || '', caption: it.caption, media_url: it.media_url }); }
          roomCount = list.length; roomList = list;
          idx3d = roomU ? Math.max(0, list.findIndex((x) => x.uid === roomU)) : roomIdx;
          const cur = list[idx3d]; if (!cur) { setStatus('Salle vide'); return; }
          const isMine = cur.uid === meId;
          setIsMyRoom(isMine); // outils avatar/perso uniquement dans MA salle
          const roomTag = (cur.caption || '').replace(/\[[A-Z0-9]+\]/g, '').trim();
          setStatus(isMine ? 'MA salle' + (roomTag ? ' — ' + roomTag.slice(0, 40) : '') : 'Salle de ' + cur.name + (roomTag ? ' — ' + roomTag.slice(0, 30) : ''));
          fillSoundWall(cur.uid); // mur de son = TOP du propriétaire de la salle
          // avatar + nom du VOISIN au-dessus de chaque porte (chez qui on va)
          const tagDoor = (kind: string, nb: any) => {
            const g = doorGroups[kind]; if (!g || !nb) return;
            const av = new THREE.Mesh(new THREE.CircleGeometry(0.42, 32), new THREE.MeshBasicMaterial({ color: 0x2a2a36 }));
            av.position.set(0, 2.95, 0.05); g.add(av);
            if (nb.avatar) new THREE.TextureLoader().load(nb.avatar, (t) => { av.material = new THREE.MeshBasicMaterial({ map: t }); av.material.needsUpdate = true; });
            const nl = mkLabel(nb.name.slice(0, 16)); nl.position.set(0, 2.35, 0.05); g.add(nl);
          };
          const nb = (k: number) => roomCount ? list[((idx3d + k) % roomCount + roomCount) % roomCount] : null;
          tagDoor('prev', nb(-1)); tagDoor('next', nb(1));
          // GALERIE : les posts (images) de CE user accrochés aux murs latéraux
          const myPosts = [...(fr.items || []), ...(al.items || [])].filter((it: any) => (it.author?.id || it.user_id) === cur.uid);
          const seenP = new Set<string>(); const imgs: string[] = [];
          for (const p of myPosts) { if (seenP.has(p.id)) continue; seenP.add(p.id); if (p.media_url && /\.(png|jpg|jpeg|webp|gif)(\?|$)/i.test(p.media_url)) imgs.push(p.media_url); }
          let gi = 0;
          for (const w of [walls[1]]) for (let k = 0; k < 6; k++) { const u = imgs[gi++]; if (!u) break; hangImage(u, w, k % 3, Math.floor(k / 3)); } // posts sur le mur GAUCHE

          // SPECTATEUR : si le propriétaire de la salle est EN DIRECT, on reçoit son flux
          if (cur.uid && cur.uid !== meId) {
            try {
              const stt = await (await fetch('/api/live/' + cur.uid + '?status=1', { cache: 'no-store' })).json();
              if (stt.live) {
                const vid = document.createElement('video'); vid.autoplay = true; vid.playsInline = true;
                let vScreen: any = null;
                startViewer(cur.uid, (s) => {
                  if (s) {
                    vid.srcObject = s; vid.play().catch(() => {});
                    if (!vScreen) {
                      vScreen = new THREE.Group();
                      const frb = new THREE.Mesh(new THREE.PlaneGeometry(5.4, 3.15), new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0x330000, emissiveIntensity: 0.4 }));
                      const scb = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 2.95), new THREE.MeshBasicMaterial({ map: new THREE.VideoTexture(vid) })); scb.position.z = 0.03;
                      vScreen.add(frb, scb); vScreen.position.set(0, 2.7, -(HW - 0.12)); scene.add(vScreen);
                    }
                    setStatus('' + cur.name + ' est EN DIRECT');
                    setWatchLiveId(cur.uid); // → overlay commentaires spectateur
                  } else { if (vScreen) { scene.remove(vScreen); vScreen = null; } setWatchLiveId(null); }
                });
              }
            } catch { /* */ }
          }
          // TOILE DE FOND : la photo de salle (room_photo) couvre tout le mur du fond
          const url = cur.media_url || '';
          if (/\.(png|jpg|jpeg|webp|gif)(\?|$)/i.test(url)) {
            loader.load(url, (tex) => { back.material = new THREE.MeshBasicMaterial({ map: tex }); });
          } else if (/\.(mp4|webm|mov)(\?|$)/i.test(url)) {
            const v = document.createElement('video'); v.src = url; v.crossOrigin = 'anonymous'; v.loop = true; v.muted = true; v.playsInline = true; v.play().catch(() => {});
            back.material = new THREE.MeshBasicMaterial({ map: new THREE.VideoTexture(v) });
          } // sinon (texte/post) : mur du fond neutre + titre dans le bandeau
        } catch { /* */ }
      })();

      // état avatar partagé : la pose/animation lit ça (danse quand un clip joue)
      let leaModel: any = null, leaBaseY = 0, dancing = false;
      // système d'ACTIONS corporelles (marche/accroupi/salut) — piloté par l'IA
      let action: 'none' | 'walk' | 'squat' | 'wave' = 'none';
      const walkTarget = new THREE.Vector3();
      let squatAmt = 0, waveEnd = 0;
      let rawMixer: any = null, rawOn = false; const rawClips: Record<string, any> = {}; // mocap Mixamo retargeté
      let startWalk: () => void = () => {};
      // sélecteur d'animations à la demande (n'importe quel fichier → retarget → joue)
      let SK: any = null, FBXL: any = null, animTgt: any = null;
      const fileClips: Record<string, any> = {};
      const BONEMAP: Record<string, string> = { J_Bip_C_Hips: 'mixamorig:Hips', J_Bip_C_Spine: 'mixamorig:Spine', J_Bip_C_Chest: 'mixamorig:Spine1', J_Bip_C_UpperChest: 'mixamorig:Spine2', J_Bip_C_Neck: 'mixamorig:Neck', J_Bip_C_Head: 'mixamorig:Head', J_Bip_L_Shoulder: 'mixamorig:LeftShoulder', J_Bip_L_UpperArm: 'mixamorig:LeftArm', J_Bip_L_LowerArm: 'mixamorig:LeftForeArm', J_Bip_L_Hand: 'mixamorig:LeftHand', J_Bip_R_Shoulder: 'mixamorig:RightShoulder', J_Bip_R_UpperArm: 'mixamorig:RightArm', J_Bip_R_LowerArm: 'mixamorig:RightForeArm', J_Bip_R_Hand: 'mixamorig:RightHand', J_Bip_L_UpperLeg: 'mixamorig:LeftUpLeg', J_Bip_L_LowerLeg: 'mixamorig:LeftLeg', J_Bip_L_Foot: 'mixamorig:LeftFoot', J_Bip_L_ToeBase: 'mixamorig:LeftToeBase', J_Bip_R_UpperLeg: 'mixamorig:RightUpLeg', J_Bip_R_LowerLeg: 'mixamorig:RightLeg', J_Bip_R_Foot: 'mixamorig:RightFoot', J_Bip_R_ToeBase: 'mixamorig:RightToeBase' };

      // ÉCOUTE LE SON : on capte le son ambiant (haut-parleur du tel qui joue le clip)
      // via le micro → analyse énergie/basses → Léa danse sur le VRAI rythme.
      let audioCtx: any = null, analyser: any = null, freq: Uint8Array | null = null, micStream: MediaStream | null = null;
      let energy = 0, energyAvg = 0, beatEnv = 0;
      const startMic = async () => {
        if (analyser) return;
        try {
          micStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } as any });
          const AC = (window.AudioContext || (window as any).webkitAudioContext);
          audioCtx = new AC(); if (audioCtx.state === 'suspended') await audioCtx.resume();
          const src = audioCtx.createMediaStreamSource(micStream);
          analyser = audioCtx.createAnalyser(); analyser.fftSize = 256; analyser.smoothingTimeConstant = 0.55;
          freq = new Uint8Array(analyser.frequencyBinCount); src.connect(analyser);
        } catch { analyser = null; } // micro refusé → repli tempo fixe
      };
      const stopMic = () => {
        try { micStream?.getTracks().forEach((t) => t.stop()); audioCtx?.close(); } catch { /* */ }
        micStream = null; audioCtx = null; analyser = null; freq = null; energy = 0; beatEnv = 0;
      };
      const sampleAudio = () => {
        if (analyser && freq) {
          analyser.getByteFrequencyData(freq);
          let bass = 0; for (let i = 1; i < 8; i++) bass += freq[i]; bass /= (7 * 255);
          energy = bass; energyAvg = energyAvg * 0.9 + energy * 0.1;
          if (energy > energyAvg * 1.35 + 0.04) beatEnv = 1; else beatEnv *= 0.84;
        } else if (dancing) { energy = 0.55; beatEnv *= 0.84; } // repli sans micro
      };

      let cssObj: any = null;
      const closeWall = () => {
        if (cssObj) {
          cssObj.element?.remove(); cssScene.remove(cssObj);
          if (cssObj.userData?.occ) scene.remove(cssObj.userData.occ);
          if (cssObj.userData?.thumb) cssObj.userData.thumb.visible = true;
          cssObj = null;
        }
        dancing = false; if (leaModel) leaModel.position.y = leaBaseY; stopMic(); // stop la danse
        setPlaying(null);
      };
      closeWallRef.current = closeWall;
      const playOnWall = (mesh: any) => {
        closeWall();
        const ifr = document.createElement('iframe');
        ifr.src = `https://www.youtube.com/embed/${mesh.userData.ytId}?autoplay=1&playsinline=1&rel=0`;
        ifr.allow = 'autoplay; encrypted-media; picture-in-picture';
        ifr.style.border = '0'; ifr.style.width = PX_W + 'px'; ifr.style.height = PX_H + 'px';
        ifr.style.background = '#000'; ifr.style.pointerEvents = 'auto';
        cssObj = new CSS3DObject(ifr);
        const px = mesh.position.x + mesh.userData.inn[0], py = mesh.position.y + mesh.userData.inn[1], pz = mesh.position.z + mesh.userData.inn[2];
        cssObj.position.set(px, py, pz);
        cssObj.rotation.set(...mesh.userData.rot);
        const w = mesh.userData.w || TW, h = mesh.userData.h || TH;
        const s = (w / PX_W) * 1.04; cssObj.scale.set(s, s, s); // lecteur à la taille de la vignette (plus de rétrécissement)
        const occ = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ colorWrite: false }));
        occ.position.set(px, py, pz); occ.rotation.set(...mesh.userData.rot);
        occ.renderOrder = -10;
        scene.add(occ);
        mesh.visible = false;
        cssObj.userData = { occ, thumb: mesh };
        cssScene.add(cssObj);
        dancing = true; startMic(); // un clip joue → Léa danse + écoute le son
        setPlaying({ id: mesh.userData.ytId, title: mesh.userData.title || '' });
      };

      const ray = new THREE.Raycaster(), ptr = new THREE.Vector2();
      let down: { x: number; y: number; t: number } | null = null;
      const onDown = (e: PointerEvent) => { down = { x: e.clientX, y: e.clientY, t: e.timeStamp }; };
      const onUp = (e: PointerEvent) => {
        if (!down) return;
        const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
        const dt = e.timeStamp - down.t; down = null;
        if (moved > 8 || dt > 500) return;
        const rc = el.getBoundingClientRect();
        ptr.x = ((e.clientX - rc.left) / rc.width) * 2 - 1;
        ptr.y = -((e.clientY - rc.top) / rc.height) * 2 + 1;
        ray.setFromCamera(ptr, camera);
        const hit = ray.intersectObjects(clickable, false)[0];
        if (hit) { playOnWall(hit.object); return; }
        // tap sur une PORTE → pièce précédente / suivante
        const dh = ray.intersectObjects(doors, false)[0];
        if (dh) {
          const side = dh.object.userData.side;
          if (side === 'prev' || side === 'next') {
            const step = side === 'next' ? 1 : -1;
            const n = roomCount ? ((idx3d + step) % roomCount + roomCount) % roomCount : 0;
            const dest = roomList[n]; if (dest) location.assign('/piece?u=' + dest.uid);
          } else if (side === 'sortie') {
            closeWall(); exitToFeedPost(roomList[idx3d]?.postId); // retour PILE sur le post d'origine
          } else { // entrée : retour d'où l'on vient
            exitToFeedPost(roomList[idx3d]?.postId);
          }
          return;
        }
        // tap sur le SOL → Léa marche jusque-là
        const fh = ray.intersectObject(floor, false)[0];
        if (fh) { walkTarget.copy(fh.point); startWalk(); }
      };
      el.addEventListener('pointerdown', onDown);
      el.addEventListener('pointerup', onUp);

      scene.add(new THREE.HemisphereLight(0xffffff, 0x202028, 0.7));
      const key = new THREE.DirectionalLight(0xffffff, 2.0); key.position.set(2, 4, 3); key.castShadow = true;
      key.shadow.mapSize.set(1024, 1024); key.shadow.bias = -0.0015;
      key.shadow.camera.near = 0.5; key.shadow.camera.far = 18;
      key.shadow.camera.left = -7; key.shadow.camera.right = 7; key.shadow.camera.top = 7; key.shadow.camera.bottom = -7;
      scene.add(key);
      const spot = new THREE.SpotLight(0xfff0dd, 12, 8, Math.PI / 5, 0.4); spot.position.set(0, 3, 0.5); scene.add(spot);

      const controls = new OrbitControls(camera, renderer.domElement);
      controls.target.set(0, 1.4, 0); controls.enablePan = false;
      controls.minDistance = 1.2; controls.maxDistance = 11; controls.maxPolarAngle = Math.PI / 1.9;
      controls.update();

      let mixer: any = null;
      const B: Record<string, any> = {};        // os récupérés par nom (rig VRoid)
      let leaReady = false, humanoid: any = null, mocapOn = false;
      const clips: Record<string, any> = {};    // clips mocap VRMA
      const arkitS: { inf: number[]; d: Record<string, number> }[] = []; // blendshapes ARKit (Streamoji)
      let lookYaw = 0, lookPitch = 0;            // regard caméra lissé (Streamoji)
      // MOCAP plein-squelette (Mixamo/RPM) — chaque articulation animée
      let sMixer: any = null; const sActions: Record<string, any> = {}; let sCurrent = '';
      let sGender: 'f' | 'm' = 'f';
      let faceMesh: any = null, iMouthA = -1, iMouthO = -1, iBlink = -1, iFun = -1, iJoy = -1, iSurp = -1; // morphs visage
      try {
        const g = await new GLTFLoader().loadAsync(glbUrl);
        const m = g.scene; m.traverse((o: any) => {
          if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; if (o.morphTargetDictionary && o.morphTargetDictionary['Face_Blendshape.Fcl_MTH_A'] != null) faceMesh = o; }
          if (o.isBone || o.type === 'Bone') B[o.name] = o;
        });
        if (faceMesh) { const d = faceMesh.morphTargetDictionary; iMouthA = d['Face_Blendshape.Fcl_MTH_A']; iMouthO = d['Face_Blendshape.Fcl_MTH_O']; iBlink = d['Face_Blendshape.Fcl_EYE_Close']; iFun = d['Face_Blendshape.Fcl_ALL_Fun']; iJoy = d['Face_Blendshape.Fcl_ALL_Joy']; iSurp = d['Face_Blendshape.Fcl_ALL_Surprised']; }
        scene.add(m);
        // pose de repli (si mocap indispo) : bras le long du corps
        if (B.J_Bip_L_UpperArm) B.J_Bip_L_UpperArm.rotation.z = -1.15;
        if (B.J_Bip_R_UpperArm) B.J_Bip_R_UpperArm.rotation.z = 1.15;
        if (B.J_Bip_L_LowerArm) B.J_Bip_L_LowerArm.rotation.y = -0.18;
        if (B.J_Bip_R_LowerArm) B.J_Bip_R_LowerArm.rotation.y = 0.18;
        m.updateWorldMatrix(true, true);
        const box = new THREE.Box3().setFromObject(m); const c = box.getCenter(new THREE.Vector3());
        m.position.x -= c.x; m.position.z -= c.z; m.position.y -= box.min.y;
        leaModel = m; leaBaseY = m.position.y;
        // DEBUG diagnostic (Pascal 2026-06-18) : confirme que l'avatar est chargé + ses dims.
        for (const k of ['J_Bip_C_Hips', 'J_Bip_C_Spine', 'J_Bip_C_Chest', 'J_Bip_C_UpperChest', 'J_Bip_C_Neck', 'J_Bip_C_Head', 'J_Bip_L_UpperArm', 'J_Bip_R_UpperArm', 'J_Bip_L_LowerArm', 'J_Bip_R_LowerArm', 'J_Bip_L_UpperLeg', 'J_Bip_R_UpperLeg', 'J_Bip_L_LowerLeg', 'J_Bip_R_LowerLeg'])
          if (B[k]) B[k].userData.base = B[k].rotation.clone();

        // ---- STREAMOJI : rig humain standard (Hips/Spine/Neck/Head/Arms/Legs).
        //      On mémorise la pose de repos des os pour l'animateur procédural. ----
        for (const k of ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head', 'LeftEye', 'RightEye', 'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand', 'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand', 'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'RightUpLeg', 'RightLeg', 'RightFoot'])
          if (B[k] && !B[k].userData.base) B[k].userData.base = B[k].rotation.clone();
        if (isStreamoji) {
          m.traverse((o: any) => {
            if (o.isMesh && o.morphTargetDictionary && o.morphTargetInfluences &&
                (o.morphTargetDictionary['jawOpen'] != null || o.morphTargetDictionary['eyeBlinkLeft'] != null))
              arkitS.push({ inf: o.morphTargetInfluences, d: o.morphTargetDictionary });
          });
          // MOCAP plein-squelette : clips Mixamo/RPM (mêmes noms d'os) → AnimationMixer.
          // On retire Hips.position (déplacement racine géré nous-mêmes) → anim SUR PLACE.
          sMixer = new THREE.AnimationMixer(m);
          const loadAnim = async (name: string, url: string) => {
            try {
              const g = await new GLTFLoader().loadAsync(url);
              const c = g.animations?.[0]; if (!c) return;
              c.tracks = c.tracks.filter((t: any) => !/Hips\.position$/.test(t.name));
              c.tracks.forEach((t: any) => { t.name = t.name.replace(/^mixamorig:?/, ''); });
              sActions[name] = sMixer.clipAction(c);
            } catch { /* clip indispo */ }
          };
          // EN ARRIÈRE-PLAN (ne bloque PAS l'apparition de l'avatar) : les clips
          // s'attachent quand ils sont prêts ; la boucle de rendu démarre tout de suite.
          void (async () => {
            await loadAnim('idle', `/avatar-anim/${sGender}_idle.glb`);
            await loadAnim('walk', `/avatar-anim/${sGender}_walk.glb`);
            await loadAnim('talk', `/avatar-anim/${sGender}_talk.glb`);
            if (sActions.idle) { sActions.idle.play(); sCurrent = 'idle'; }
          })();
        }

        // ---- 3D-DRIVEN : mocap VRMA retargetée sur le squelette VRoid (contrôle net) ----
        try {
          if (isStreamoji) throw new Error('skip-vrm'); // rig Streamoji → mocap plein-squelette (sMixer), pas le VRoid
          const tv: any = await import('@pixiv/three-vrm'); const VRMHumanoid = tv.VRMHumanoid || tv.default?.VRMHumanoid;
          const va2: any = await import('@pixiv/three-vrm-animation');
          const VRMAnimationLoaderPlugin = va2.VRMAnimationLoaderPlugin || va2.default?.VRMAnimationLoaderPlugin;
          const createVRMAnimationClip = va2.createVRMAnimationClip || va2.default?.createVRMAnimationClip;
          if (!VRMHumanoid || !VRMAnimationLoaderPlugin || !createVRMAnimationClip) throw new Error('exports VRM manquants');
          const MAP: Record<string, string> = {
            hips: 'J_Bip_C_Hips', spine: 'J_Bip_C_Spine', chest: 'J_Bip_C_Chest', upperChest: 'J_Bip_C_UpperChest',
            neck: 'J_Bip_C_Neck', head: 'J_Bip_C_Head',
            leftShoulder: 'J_Bip_L_Shoulder', leftUpperArm: 'J_Bip_L_UpperArm', leftLowerArm: 'J_Bip_L_LowerArm', leftHand: 'J_Bip_L_Hand',
            rightShoulder: 'J_Bip_R_Shoulder', rightUpperArm: 'J_Bip_R_UpperArm', rightLowerArm: 'J_Bip_R_LowerArm', rightHand: 'J_Bip_R_Hand',
            leftUpperLeg: 'J_Bip_L_UpperLeg', leftLowerLeg: 'J_Bip_L_LowerLeg', leftFoot: 'J_Bip_L_Foot', leftToes: 'J_Bip_L_ToeBase',
            rightUpperLeg: 'J_Bip_R_UpperLeg', rightLowerLeg: 'J_Bip_R_LowerLeg', rightFoot: 'J_Bip_R_Foot', rightToes: 'J_Bip_R_ToeBase',
          };
          const hb: any = {};
          for (const [vn, jb] of Object.entries(MAP)) if (B[jb]) hb[vn] = { node: B[jb] };
          humanoid = new VRMHumanoid(hb);
          const vrmLike: any = { humanoid, scene: m, meta: { metaVersion: '1' }, expressionManager: undefined, lookAt: undefined, update() {} };
          if (humanoid.normalizedHumanBonesRoot) scene.add(humanoid.normalizedHumanBonesRoot);
          const vl = new GLTFLoader(); vl.register((p: any) => new VRMAnimationLoaderPlugin(p));
          const load = async (name: string, url: string) => { try { const gg = await vl.loadAsync(url); const va = gg.userData?.vrmAnimations?.[0]; if (va) clips[name] = createVRMAnimationClip(va, vrmLike); } catch { /* clip indispo */ } };
          await load('idle', '/uploads/anim-Relax.vrma');
          await load('look', '/uploads/anim-LookAround.vrma');
          await load('wave', '/uploads/anim-Goodbye.vrma');
          await load('clap', '/uploads/anim-Clapping.vrma');
          mixer = new THREE.AnimationMixer(humanoid.normalizedHumanBonesRoot); // cible les os normalisés
          if (clips.idle) { mixer.clipAction(clips.idle).play(); mocapOn = true; }
          // BIBLIOTHÈQUE D'ANIMATIONS Mixamo retargetées sur le squelette VRoid J_Bip.
          // Dépose simplement /uploads/mocap-<action>.fbx (ou .glb) → câblé tout seul.
          let dbg = '';
          try {
            SK = await import('three/examples/jsm/utils/SkeletonUtils.js');
            FBXL = (await import('three/examples/jsm/loaders/FBXLoader.js')).FBXLoader;
            m.traverse((o: any) => { if (o.isSkinnedMesh && !animTgt) animTgt = o; });
            const sk = SK; const FBXLoader = FBXL; const tgt = animTgt; const N = BONEMAP;
            const retargetFrom = async (action: string, file: string, clipName?: string) => {
              try {
                let srcScene: any, anims: any[];
                const url = '/api/anim/file?name=' + encodeURIComponent(file);
                if (file.toLowerCase().endsWith('.fbx')) { const fx = await new FBXLoader().loadAsync(url); srcScene = fx; anims = fx.animations; }
                else { const gg = await new GLTFLoader().loadAsync(url); srcScene = gg.scene; anims = gg.animations; }
                let src: any = null; srcScene.traverse((o: any) => { if (o.isSkinnedMesh && !src) src = o; });
                if (!src) {
                  // FBX « Without Skin » : os seuls → on reconstruit un Skeleton depuis les Bone
                  const bones: any[] = []; srcScene.traverse((o: any) => { if (o.isBone) bones.push(o); });
                  if (bones.length) { srcScene.updateMatrixWorld(true); srcScene.skeleton = new THREE.Skeleton(bones); src = srcScene; }
                }
                const clip = clipName ? anims.find((a: any) => a.name === clipName) : anims[0];
                if (!src) { if (action === 'dance') dbg = 'danceKO: aucun os dans le FBX'; return; }
                if (!clip) { if (action === 'dance') dbg = 'danceKO: pas de clip dans le FBX'; return; }
                rawClips[action] = sk.retargetClip(tgt, src, clip, { hip: 'mixamorig:Hips', names: N, preserveHipPosition: false, useFirstFramePosition: false });
              } catch (e) { if (action === 'dance') dbg = 'danceKO: ' + (((e as Error)?.message) || '').slice(0, 50); }
            };
            // défauts (Soldier) puis MAPPING utilisateur (action→fichier d'origine) via /api/anim
            await retargetFrom('walk', 'mocap-soldier.glb', 'Walk');
            await retargetFrom('run', 'mocap-soldier.glb', 'Run');
            try {
              const map = ((await (await fetch('/api/anim', { cache: 'no-store' })).json())?.mapping) || {};
              for (const [act, file] of Object.entries(map)) if (file) await retargetFrom(act, file as string);
            } catch { /* pas de mapping */ }
            if (Object.keys(rawClips).length) rawMixer = new THREE.AnimationMixer(m);
          } catch (e) { dbg = 'mixamoKO: ' + (((e as Error)?.message) || '').slice(0, 50); }
          void dbg;
        } catch { /* mocap indispo → procédural */ }

        leaReady = true;
      } catch { setStatus('Pièce chargée (avatar indispo).'); }

      // dispatcher : ACTION (marche/accroupi/salut) > danse (clip) > idle vivant
      const animateLea = (t: number, dt: number) => {
        if (!leaReady) return;
        const set = (name: string, dx = 0, dy = 0, dz = 0) => { const b = B[name]; if (!b?.userData?.base) return; b.rotation.set(b.userData.base.x + dx, b.userData.base.y + dy, b.userData.base.z + dz); };
        const restLegs = () => { set('J_Bip_L_UpperLeg'); set('J_Bip_R_UpperLeg'); set('J_Bip_L_LowerLeg'); set('J_Bip_R_LowerLeg'); };
        // clignement périodique (toutes ~3,5 s)
        if (faceMesh && iBlink >= 0) { const c = t % 3.5; faceMesh.morphTargetInfluences[iBlink] = c < 0.16 ? (1 - Math.abs(c - 0.08) / 0.08) : 0; }
        // bouche : s'ouvre sur l'énergie du son quand ça joue (elle "chante")
        if (faceMesh && iMouthA >= 0) {
          const open = dancing ? Math.min(1, energy * 2.4 + beatEnv * 0.4) : 0;
          faceMesh.morphTargetInfluences[iMouthA] = open * (0.7 + 0.3 * Math.sin(t * 9));
          if (iMouthO >= 0) faceMesh.morphTargetInfluences[iMouthO] = open * 0.4 * (0.5 + 0.5 * Math.sin(t * 6 + 1));
        }
        // EXPRESSIONS par MORPHING : sourire de repos + visage joyeux quand elle danse
        if (faceMesh) {
          const inf = faceMesh.morphTargetInfluences;
          const joy = dancing ? 0.45 : 0;
          if (iFun >= 0) inf[iFun] = 0.16 + joy * 0.5 + Math.sin(t * 0.4) * 0.05;
          if (iJoy >= 0) inf[iJoy] = joy * (0.7 + 0.3 * Math.sin(t * 1.5));
          if (iSurp >= 0) inf[iSurp] = action === 'wave' ? 0.3 : 0;
        }
        if (mocapOn || rawOn) return; // le mocap (VRMA ou Mixamo) pilote les os : on ne touche pas
        squatAmt += ((action === 'squat' ? 1 : 0) - squatAmt) * Math.min(1, dt * 4); // ease

        // MARCHE vers la cible
        if (action === 'walk' && leaModel) {
          const dir = walkTarget.clone().sub(leaModel.position); dir.y = 0; const dist = dir.length();
          if (dist < 0.14) { action = 'none'; leaModel.position.y = leaBaseY; restLegs(); }
          else {
            dir.normalize();
            leaModel.position.addScaledVector(dir, Math.min(dist, 1.2 * dt));
            leaModel.rotation.y = Math.atan2(dir.x, dir.z);
            const p = t * 8;
            set('J_Bip_L_UpperLeg', Math.sin(p) * 0.5); set('J_Bip_R_UpperLeg', Math.sin(p + Math.PI) * 0.5);
            set('J_Bip_L_LowerLeg', Math.max(0, -Math.sin(p)) * 0.8); set('J_Bip_R_LowerLeg', Math.max(0, -Math.sin(p + Math.PI)) * 0.8);
            set('J_Bip_L_UpperArm', Math.sin(p + Math.PI) * 0.3); set('J_Bip_R_UpperArm', Math.sin(p) * 0.3);
            set('J_Bip_C_Spine', 0.05);
            leaModel.position.y = leaBaseY + Math.abs(Math.sin(p)) * 0.02;
            return;
          }
        }
        // ACCROUPI (tant que squatAmt non nul)
        if (squatAmt > 0.03) {
          const a = squatAmt;
          set('J_Bip_L_UpperLeg', 1.1 * a); set('J_Bip_R_UpperLeg', 1.1 * a);
          set('J_Bip_L_LowerLeg', -1.6 * a); set('J_Bip_R_LowerLeg', -1.6 * a);
          set('J_Bip_C_Spine', 0.25 * a);
          set('J_Bip_C_Head', Math.sin(t * 0.6) * 0.04, Math.sin(t * 0.35) * 0.1, 0);
          set('J_Bip_L_LowerArm'); set('J_Bip_R_LowerArm');
          if (leaModel) leaModel.position.y = leaBaseY - 0.34 * a;
          return;
        }
        // SALUT (timé)
        if (action === 'wave') {
          if (performance.now() / 1000 > waveEnd) { action = 'none'; }
          else {
            restLegs();
            set('J_Bip_R_UpperArm', -0.4, 0, -1.15); set('J_Bip_R_LowerArm', 0, 0, Math.sin(t * 10) * 0.5);
            set('J_Bip_C_Head', 0, 0.06, Math.sin(t * 5) * 0.03);
            set('J_Bip_C_Chest', Math.sin(t * 1.1) * 0.03, 0, 0);
            if (leaModel) leaModel.position.y = leaBaseY;
            return;
          }
        }
        if (dancing) {
          restLegs();
          const w = t * 6.2832 * 1.9;
          const inten = 0.3 + Math.min(1.2, energy * 2.4);  // amplitude pilotée par le SON
          const pop = beatEnv;                               // coup sur le beat détecté
          set('J_Bip_C_Hips', 0, Math.sin(w * 0.5) * 0.12 * inten, Math.sin(w) * 0.16 * inten);
          set('J_Bip_C_Spine', Math.sin(w) * 0.05 * inten, 0, Math.sin(w + 1) * 0.09 * inten);
          set('J_Bip_C_Chest', Math.sin(w + 0.4) * 0.05 * inten, 0, Math.sin(w) * 0.07 * inten);
          set('J_Bip_C_UpperChest', Math.sin(w + 0.4) * 0.04 * inten, 0, 0);
          set('J_Bip_C_Neck', Math.sin(w) * 0.05 * inten, 0, Math.sin(w) * 0.04 * inten);
          set('J_Bip_C_Head', Math.sin(w) * 0.09 * inten + pop * 0.05, Math.sin(w * 0.5) * 0.1 * inten, Math.sin(w + 0.5) * 0.07 * inten);
          set('J_Bip_L_UpperArm', Math.sin(w) * 0.35 * inten + pop * 0.25, 0, Math.sin(w) * 0.3 * inten);
          set('J_Bip_R_UpperArm', Math.sin(w + Math.PI) * 0.35 * inten + pop * 0.25, 0, Math.sin(w + Math.PI) * 0.3 * inten);
          set('J_Bip_L_LowerArm', 0, Math.sin(w) * 0.25 * inten, 0);
          set('J_Bip_R_LowerArm', 0, Math.sin(w + Math.PI) * 0.25 * inten, 0);
          if (leaModel) leaModel.position.y = leaBaseY + (Math.abs(Math.sin(w)) * 0.03 + pop * 0.05) * inten; // rebond sur le beat
        } else {
          restLegs();
          if (leaModel) { leaModel.rotation.y += (0 - leaModel.rotation.y) * Math.min(1, dt * 3); leaModel.position.y = leaBaseY; }
          set('J_Bip_C_Hips', 0, Math.sin(t * 0.5) * 0.04, Math.sin(t * 0.45) * 0.02);
          set('J_Bip_C_Spine', Math.sin(t * 1.1) * 0.02, 0, Math.sin(t * 0.55) * 0.02);
          set('J_Bip_C_Chest', Math.sin(t * 1.1 + 0.3) * 0.03, 0, 0);          // respiration
          set('J_Bip_C_UpperChest', Math.sin(t * 1.1 + 0.3) * 0.02, 0, 0);
          set('J_Bip_C_Neck', Math.sin(t * 0.7) * 0.03, Math.sin(t * 0.4) * 0.06, 0);
          set('J_Bip_C_Head', Math.sin(t * 0.6) * 0.04, Math.sin(t * 0.35) * 0.12, Math.sin(t * 0.5) * 0.03);
          set('J_Bip_L_UpperArm', 0, 0, Math.sin(t * 0.6) * 0.03);
          set('J_Bip_R_UpperArm', 0, 0, Math.sin(t * 0.6 + 1) * 0.03);
          set('J_Bip_L_LowerArm', 0, 0, 0); set('J_Bip_R_LowerArm', 0, 0, 0); // repos bras
        }
      };

      // ====== ANIMATEUR STREAMOJI (rig standard) — PILOTÉ PAR L'IA ======
      // Respiration + REGARD caméra (présence "elle me regarde") + gestes quand
      // l'IA parle + clignement/bouche (si blendshapes présents) + marche.
      const _hp = new THREE.Vector3();
      const _gt = new THREE.Vector3(); // cible du regard (écran live = toi, sinon spectateur)
      const na = (a: number) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
      // transition douce entre clips mocap
      const playS = (name: string, fade = 0.3) => {
        if (!sMixer || !sActions[name] || sCurrent === name) return;
        if (sCurrent && sActions[sCurrent]) sActions[sCurrent].fadeOut(fade);
        sActions[name].reset().setEffectiveWeight(1).fadeIn(fade).play();
        sCurrent = name;
      };
      // L'IA DIRIGE le corps : mocap plein-squelette (idle/marche/parle) + REGARD
      // en surcouche additive (le clip n'est pas écrasé). Appelé APRÈS sMixer.update.
      const animateStreamoji = (t: number, dt: number) => {
        if (!leaReady) return;
        const morph = (n: string, v: number) => { for (const a of arkitS) { const i = a.d[n]; if (i != null) a.inf[i] = v; } };
        const speaking = performance.now() / 1000 < speakRef.current;

        // choix du clip : marche > parle > idle
        if (action === 'walk' && leaModel) {
          playS('walk', 0.2);
          const dir = walkTarget.clone().sub(leaModel.position); dir.y = 0; const dist = dir.length();
          if (dist < 0.18) { action = 'none'; }
          else {
            dir.normalize();
            leaModel.position.addScaledVector(dir, Math.min(dist, 1.3 * dt));
            leaModel.rotation.y += na(Math.atan2(dir.x, dir.z) - leaModel.rotation.y) * Math.min(1, dt * 6);
          }
        } else if (speaking) playS('talk', 0.3);
        else playS('idle', 0.4);

        // REGARD vers TOI (écran live si direct, sinon spectateur) — ADDITIF sur le clip
        if (leaModel && B['Head']) {
          if (liveScreen) liveScreen.getWorldPosition(_gt); else _gt.copy(camera.position);
          B['Head'].getWorldPosition(_hp);
          const dx = _gt.x - _hp.x, dz = _gt.z - _hp.z, dy = _gt.y - _hp.y;
          const want = Math.atan2(dx, dz);
          if (liveScreen && action !== 'walk') leaModel.rotation.y += na(want - leaModel.rotation.y) * Math.min(1, dt * 1.2);
          const ty = na(want - leaModel.rotation.y);
          const tp = -Math.atan2(dy, Math.hypot(dx, dz));
          lookYaw += (Math.max(-0.7, Math.min(0.7, ty)) - lookYaw) * Math.min(1, dt * 5);
          lookPitch += (Math.max(-0.3, Math.min(0.3, tp)) - lookPitch) * Math.min(1, dt * 5);
          const nck = B['Neck']; if (nck) { nck.rotation.y += lookYaw * 0.3; nck.rotation.x += lookPitch * 0.3; }
          B['Head'].rotation.y += lookYaw * 0.5; B['Head'].rotation.x += lookPitch * 0.5;
          const sacc = Math.sin(t * 0.9) * 0.05;
          const le = B['LeftEye'], re = B['RightEye'];
          if (le?.userData?.base) le.rotation.set(le.userData.base.x + lookPitch * 0.5, le.userData.base.y + lookYaw * 0.5 + sacc, le.userData.base.z);
          if (re?.userData?.base) re.rotation.set(re.userData.base.x + lookPitch * 0.5, re.userData.base.y + lookYaw * 0.5 + sacc, re.userData.base.z);
        }

        // clignement + bouche (si blendshapes présents — avatar par avatarId)
        if (arkitS.length) {
          const c = t % 3.5; const bl = c < 0.16 ? (1 - Math.abs(c - 0.08) / 0.08) : 0;
          morph('eyeBlinkLeft', bl); morph('eyeBlinkRight', bl);
          morph('jawOpen', speaking ? Math.max(0, Math.sin(t * 11)) * 0.4 : 0);
          morph('mouthSmileLeft', speaking ? 0.18 : 0.06); morph('mouthSmileRight', speaking ? 0.18 : 0.06);
        }
      };

      // ====== PERCEPTION : l'IA VOIT DEPUIS SES YEUX (vue 1re personne) ======
      // Rendu de la scène par une caméra placée à ses yeux → image → NOTRE GPU
      // vision la décrit. En LIVE, son champ de vision capte l'écran (= toi).
      const eyeCam = new THREE.PerspectiveCamera(70, 1, 0.05, 60);
      const eyeRT = new THREE.WebGLRenderTarget(384, 384);
      const eyeBuf = new Uint8Array(384 * 384 * 4);
      const eyeFwd = new THREE.Vector3(), eyeHP = new THREE.Vector3(), eyeQ = new THREE.Quaternion();
      const eyeRawC = document.createElement('canvas'); eyeRawC.width = 384; eyeRawC.height = 384;
      const eyeOutC = document.createElement('canvas'); eyeOutC.width = 384; eyeOutC.height = 384;
      const captureEyeView = (): string | null => {
        if (!leaModel || !B['Head']) return null;
        try {
          B['Head'].getWorldPosition(eyeHP);
          leaModel.getWorldQuaternion(eyeQ);
          eyeFwd.set(0, 0, 1).applyQuaternion(eyeQ); // avant de l'avatar
          eyeCam.position.copy(eyeHP).addScaledVector(eyeFwd, 0.14); eyeCam.position.y += 0.04;
          eyeCam.lookAt(eyeHP.x + eyeFwd.x * 4, eyeHP.y + eyeFwd.y * 4, eyeHP.z + eyeFwd.z * 4);
          const prev = renderer.getRenderTarget();
          renderer.setRenderTarget(eyeRT); renderer.render(scene, eyeCam);
          renderer.readRenderTargetPixels(eyeRT, 0, 0, 384, 384, eyeBuf);
          renderer.setRenderTarget(prev);
          const rctx = eyeRawC.getContext('2d'); const octx = eyeOutC.getContext('2d');
          if (!rctx || !octx) return null;
          const idata = rctx.createImageData(384, 384); idata.data.set(eyeBuf); rctx.putImageData(idata, 0, 0);
          octx.save(); octx.translate(0, 384); octx.scale(1, -1); octx.drawImage(eyeRawC, 0, 0); octx.restore(); // RT = bottom-up → on remet d'aplomb
          return eyeOutC.toDataURL('image/jpeg', 0.6);
        } catch { return null; }
      };
      const seVoir = async () => {
        const img = captureEyeView();
        if (!img) return;
        setSeeBusy(true);
        try {
          const r = await fetch('/api/avatar/perceive', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image_b64: img }) });
          const j = await r.json();
          if (j?.text) { setLeaSay(j.text); speak(j.text); } // elle dit ce qu'elle voit
        } catch { /* */ } finally { setSeeBusy(false); }
      };
      seeRef.current = () => { void seVoir(); };
      // (perception « se voir » = uniquement sur action manuelle, plus de capture auto au chargement)

      // joue un clip mocap (idle/salut…) ; retourne false si indispo
      const playClip = (name: string) => { if (!mixer || !clips[name]) return false; mixer.stopAllAction(); const a = mixer.clipAction(clips[name]); a.reset(); a.fadeIn(0.25); a.play(); mocapOn = true; return true; };
      const goIdle = () => { rawOn = false; if (rawMixer) rawMixer.stopAllAction(); if (!playClip('idle')) mocapOn = false; };
      const playRaw = (name: string) => { if (!rawMixer || !rawClips[name]) return false; rawMixer.stopAllAction(); const a = rawMixer.clipAction(rawClips[name]); a.reset(); a.fadeIn(0.2); a.play(); rawOn = true; return true; };
      startWalk = () => { action = 'walk'; mocapOn = false; if (mixer) mixer.stopAllAction(); playRaw('walk'); };
      // actions corporelles déclenchées par l'IA (ou les boutons)
      const doAction = (a: string) => {
        if (!leaReady) return;
        // Streamoji : animateur procédural (pas de mocap VRMA/Mixamo).
        if (isStreamoji) {
          if (a === 'walk') { walkTarget.set((Math.random() * 2 - 1) * 1.6, 0, (Math.random() * 1.2 - 0.3)); action = 'walk'; }
          else { action = 'none'; }
          return;
        }
        rawOn = false; if (rawMixer) rawMixer.stopAllAction();
        if (a === 'dance') { dancing = true; startMic(); action = 'none'; mocapOn = false; if (mixer) mixer.stopAllAction(); playRaw('dance'); }
        else if (a === 'walk') { walkTarget.set((Math.random() * 2 - 1) * 2, 0, (Math.random() * 1.4 - 0.4)); startWalk(); }
        else if (a === 'squat') { action = 'squat'; mocapOn = false; if (mixer) mixer.stopAllAction(); playRaw('squat'); }
        else if (a === 'wave') { dancing = false; stopMic(); action = 'none'; if (playRaw('wave') || playClip('wave')) { if (clips.wave || rawClips.wave) setTimeout(goIdle, ((rawClips.wave || clips.wave)?.duration || 3) * 1000); } else { action = 'wave'; waveEnd = performance.now() / 1000 + 3.2; } }
        else { dancing = false; stopMic(); action = 'none'; if (leaModel) leaModel.position.y = leaBaseY; goIdle(); }
      };
      leaActRef.current = doAction;

      // LECTURE À LA DEMANDE : charge + retarge n'importe quel fichier d'anim puis le joue
      const playAnimFile = async (file: string) => {
        if (!leaReady) { setLeaSay('DBG: avatar pas prêt'); return; }
        let clip = fileClips[file];
        if (clip === undefined) {
          clip = null;
          try {
            if (!SK) { setLeaSay('DBG: SkeletonUtils non chargé'); fileClips[file] = null; return; }
            if (!animTgt) { setLeaSay('DBG: pas de SkinnedMesh cible (VRoid)'); fileClips[file] = null; return; }
            const url = '/api/anim/file?name=' + encodeURIComponent(file);
            setLeaSay('DBG: chargement ' + file + '…');
            let srcScene: any, anims: any[];
            if (/\.fbx$/i.test(file)) { if (!FBXL) { setLeaSay('DBG: FBXLoader KO'); fileClips[file] = null; return; } const fx = await new FBXL().loadAsync(url); srcScene = fx; anims = fx.animations || []; }
            else { const gg = await new GLTFLoader().loadAsync(url); srcScene = gg.scene; anims = gg.animations || []; }
            let src: any = null; srcScene.traverse((o: any) => { if (o.isSkinnedMesh && !src) src = o; });
            let srcBoneNames: string[] = [];
            if (!src) { const bones: any[] = []; srcScene.traverse((o: any) => { if (o.isBone) bones.push(o); }); if (bones.length) { srcScene.updateMatrixWorld(true); srcScene.skeleton = new THREE.Skeleton(bones); src = srcScene; srcBoneNames = bones.map((b) => b.name); } }
            else { srcBoneNames = (src.skeleton?.bones || []).map((b: any) => b.name); }
            if (!src) { setLeaSay('DBG: pas d\'os dans ' + file); fileClips[file] = null; return; }
            if (!anims[0]) { setLeaSay('DBG: pas de clip dans ' + file); fileClips[file] = null; return; }
            // détecte le préfixe réel des os (Mixamo FBX importé peut renommer mixamorig:)
            const hipName = srcBoneNames.find((n) => /hips?$/i.test(n)) || 'mixamorig:Hips';
            const prefix = hipName.replace(/hips?$/i, ''); // ex "mixamorig:" ou "mixamorig" ou ""
            const names: Record<string, string> = {};
            for (const [jb, mx] of Object.entries(BONEMAP)) names[jb] = mx.replace(/^mixamorig:/, prefix);
            clip = SK.retargetClip(animTgt, src, anims[0], { hip: hipName, names, preserveHipPosition: false, useFirstFramePosition: false });
            // retire les pistes de POSITION (translation hanches Mixamo en cm → téléporte/disparaît).
            // On ne garde que les rotations → danse SUR PLACE.
            if (clip?.tracks) clip.tracks = clip.tracks.filter((t: any) => !/\.position$/.test(t.name));
            if (!clip?.tracks?.length) { setLeaSay('DBG 0 pistes | os: ' + srcBoneNames.slice(0, 4).join(',')); fileClips[file] = null; return; }
          } catch (e) { setLeaSay('DBG err: ' + (((e as Error)?.message) || String(e)).slice(0, 70)); fileClips[file] = null; return; }
          fileClips[file] = clip;
        }
        if (!clip) { setLeaSay('Animation indispo : ' + file); return; }
        if (!rawMixer && leaModel) rawMixer = new THREE.AnimationMixer(leaModel);
        if (!rawMixer) { setLeaSay('DBG: pas de mixer'); return; }
        dancing = false; stopMic(); mocapOn = false; if (mixer) mixer.stopAllAction();
        rawMixer.stopAllAction(); const a = rawMixer.clipAction(clip); a.reset(); a.fadeIn(0.2); a.play(); rawOn = true; action = 'none';
        setLeaSay('▶︎ ' + file.replace(/\.[^.]+$/, '') + ' (' + (clip.tracks?.length || 0) + ' pistes)');
      };
      animPlayRef.current = (f: string) => { setLeaSay('▶︎ ' + f); void playAnimFile(f); };

      // LIVE DANS LA PIÈCE : la caméra du diffuseur sur un grand écran au mur (badge EN DIRECT)
      let liveStream: MediaStream | null = null, liveScreen: any = null, liveStopFn: (() => void) | null = null;
      const startLive = async () => {
        if (liveScreen) return;
        try {
          liveStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'user' } }, audio: true });
          const v = document.createElement('video'); v.srcObject = liveStream; v.muted = true; v.playsInline = true; await v.play().catch(() => {});
          const tex = new THREE.VideoTexture(v);
          liveScreen = new THREE.Group();
          const fr = new THREE.Mesh(new THREE.PlaneGeometry(5.4, 3.15), new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0x330000, emissiveIntensity: 0.4 }));
          const scr = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 2.95), new THREE.MeshBasicMaterial({ map: tex })); scr.position.z = 0.03;
          liveScreen.add(fr, scr); liveScreen.position.set(0, 2.7, -(HW - 0.12)); scene.add(liveScreen);
          liveStopFn = startBroadcast(meId || 'me', liveStream); // diffusion multi-spectateurs (WebRTC P2P)
          setLeaSay('Tu es EN DIRECT — les visiteurs de ta salle te voient');
        } catch { setLeaSay('Caméra refusée — live impossible'); setLive(false); }
      };
      const stopLive = () => { try { liveStopFn?.(); } catch { /* */ } liveStopFn = null; try { liveStream?.getTracks().forEach((t) => t.stop()); } catch { /* */ } if (liveScreen) { scene.remove(liveScreen); liveScreen = null; } liveStream = null; };
      liveRef.current = (on: boolean) => { if (on) void startLive(); else stopLive(); };

      const clock = new THREE.Clock();
      const groundBox = new THREE.Box3();
      let raf = 0;
      const loop = () => {
        const d = clock.getDelta();
        if (mixer) mixer.update(d);
        if (rawMixer) rawMixer.update(d);
        if (sMixer) sMixer.update(d); // mocap plein-squelette Streamoji (avant surcouche regard)
        if (humanoid && mocapOn) humanoid.update();
        // locomotion pendant la marche mocap : on déplace la racine vers la cible
        if (action === 'walk' && rawOn && leaModel) {
          const dir = walkTarget.clone().sub(leaModel.position); dir.y = 0; const dist = dir.length();
          if (dist < 0.18) { rawOn = false; if (rawMixer) rawMixer.stopAllAction(); leaModel.position.y = leaBaseY; action = 'none'; goIdle(); }
          else { dir.normalize(); leaModel.position.addScaledVector(dir, Math.min(dist, 1.0 * d)); leaModel.rotation.y = Math.atan2(dir.x, dir.z); leaModel.position.y = leaBaseY; }
        }
        if (isStreamoji) animateStreamoji(clock.elapsedTime, d);
        else { sampleAudio(); animateLea(clock.elapsedTime, d); }
        // ANCRAGE SOL : pieds toujours posés (le mocap décale les hanches). Pas en
        // danse/accroupi (mouvement vertical voulu).
        if (leaModel && leaReady && !dancing && action !== 'squat') {
          groundBox.setFromObject(leaModel);
          if (isFinite(groundBox.min.y)) leaModel.position.y -= groundBox.min.y;
        }
        controls.update(); renderer.render(scene, camera); cssRenderer.render(cssScene, camera); raf = requestAnimationFrame(loop);
      };
      loop();
      const onResize = () => { const w = el.clientWidth, h = el.clientHeight; camera.aspect = w / h; camera.updateProjectionMatrix(); renderer.setSize(w, h); cssRenderer.setSize(w, h); };
      window.addEventListener('resize', onResize);
      dispose = () => { cancelAnimationFrame(raf); window.removeEventListener('resize', onResize); el.removeEventListener('pointerdown', onDown); el.removeEventListener('pointerup', onUp); closeWall(); stopLive(); renderer.dispose(); el.innerHTML = ''; };
     } catch (e) { setStatus('Erreur 3D: ' + (((e as Error)?.message) || String(e))); }
    })();
    return () => dispose();
  }, [piece3dGate]);

  // Feature éteinte : écran de repli (accès direct par URL inclus), pas de moteur 3D.
  if (piece3dGate === 'off') {
    return (
      <main style={{ position: 'fixed', inset: 0, background: '#15151c', display: 'grid', placeItems: 'center', padding: 24 }}>
        <div style={{ textAlign: 'center', color: '#fff', fontFamily: 'system-ui', maxWidth: 360 }}>
          <div style={{ fontSize: 40, marginBottom: 10 }}>🧊</div>
          <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 6 }}>Pièces 3D désactivées</div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,.6)', marginBottom: 18 }}>Cette fonctionnalité est actuellement éteinte. Un administrateur peut l’activer.</div>
          <button onClick={() => goBack()} style={{ padding: '10px 20px', borderRadius: 12, border: 0, background: '#f59e0b', color: '#000', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>Retour</button>
        </div>
      </main>
    );
  }

  return (
    <main style={{ position: 'fixed', inset: 0, background: '#0D0D0D' }}>
      <div ref={mount} style={{ position: 'absolute', inset: 0 }} />
      <div style={{ position: 'fixed', top: 12, left: 12, right: 12, padding: '9px 13px', background: 'rgba(0,0,0,.55)', color: '#fff', borderRadius: 11, fontFamily: 'system-ui', fontSize: 13, zIndex: 5, pointerEvents: 'none' }}>
        {status}
      </div>
      {/* Sortir — glass ← haut-gauche (design Gemini) */}
      <button
        aria-label="Sortir de la pièce"
        onClick={() => { closeWallRef.current(); exitToFeedPost(rooms[curIndex]?.id); }}
        style={{ position: 'fixed', top: 'calc(env(safe-area-inset-top) + 12px)', left: 12, zIndex: 9, width: 44, height: 44, borderRadius: 999, border: '1px solid rgba(255,255,255,.14)', background: 'rgba(20,20,26,.6)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', color: '#fff', fontSize: 22, cursor: 'pointer', display: 'grid', placeItems: 'center' }}
      >←</button>
      {/* Titre + Live — glass haut-centre (design Gemini) */}
      <div style={{ position: 'fixed', top: 'calc(env(safe-area-inset-top) + 12px)', left: '50%', transform: 'translateX(-50%)', zIndex: 7, display: 'inline-flex', alignItems: 'center', gap: 8, maxWidth: '60vw', padding: '9px 16px', borderRadius: 999, border: '1px solid rgba(255,255,255,.14)', background: 'rgba(20,20,26,.6)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', color: '#fff', fontFamily: "'Outfit',sans-serif", fontWeight: 700, fontSize: 15 }}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{rooms[curIndex]?.name || 'Ma salle'}</span>
        {live && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: '#FF7F11', fontWeight: 800, fontSize: 13 }}><span style={{ width: 8, height: 8, borderRadius: 999, background: '#FF7F11' }} />Live</span>}
      </div>
      {/* Carte bas-gauche + Léa violet bas-droite (design Gemini) */}
      <button onClick={() => setMapOpen(true)} aria-label="Plan des pièces" style={{ position: 'fixed', bottom: 'calc(env(safe-area-inset-bottom) + 92px)', left: 14, zIndex: 7, width: 46, height: 46, borderRadius: 999, border: '1px solid rgba(255,255,255,.14)', background: 'rgba(20,20,26,.6)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', color: '#fff', fontSize: 20 }}>🗺️</button>
      <button onClick={() => setAnimPanel(true)} aria-label="Léa — animations" style={{ position: 'fixed', bottom: 'calc(env(safe-area-inset-bottom) + 92px)', right: 14, zIndex: 7, width: 54, height: 54, borderRadius: 999, border: 0, background: '#7C5CFF', color: '#fff', fontSize: 24, boxShadow: '0 8px 20px rgba(124,92,255,.4)' }}>✨</button>

      {playing && (
        <div style={{ position: 'fixed', bottom: 14, left: 12, right: 12, zIndex: 8, display: 'flex', alignItems: 'center', gap: 8, padding: '9px 13px', background: 'rgba(0,0,0,.6)', color: '#fff', borderRadius: 11, fontFamily: 'system-ui', fontSize: 13 }}>
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>▶️ Sur le mur : {playing.title}</span>
          <button onClick={() => closeWallRef.current()} style={{ width: 34, height: 34, borderRadius: 999, border: 0, background: 'rgba(255,255,255,.18)', color: '#fff', fontSize: 17, flex: '0 0 auto' }}>×</button>
        </div>
      )}

      {/* Réponse de TA Léa (même IA que le chat) */}
      {leaSay && !playing && (
        <div style={{ position: 'fixed', bottom: 116, left: 12, right: 12, zIndex: 8, padding: '10px 13px', background: 'rgba(20,20,28,.9)', color: '#fff', borderRadius: 14, fontFamily: 'system-ui', fontSize: 13, lineHeight: 1.35, border: '1px solid rgba(255,255,255,.35)' }}>
          <b style={{ color: '#c9b3ff' }}>{aiName}</b> — {leaSay}
        </div>
      )}

      {/* Barre : parle à TA Léa (elle répond + son corps exécute) */}
      {!playing && isMyRoom && (
        <div style={{ position: 'fixed', bottom: 14, left: 12, right: 12, zIndex: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto' }}>
            {/* Studio avatar IA (Pascal 2026-06-17) — créer/changer le corps réaliste. */}
            <button onClick={() => location.assign('/avatar-studio')} style={{ flex: '0 0 auto', padding: '7px 12px', borderRadius: 999, border: 0, background: '#ffffff', color: '#111', fontFamily: 'system-ui', fontSize: 12, fontWeight: 700 }}>Mon avatar IA</button>
            <button onClick={() => { const n = !live; setLive(n); liveRef.current(n); fetch('/api/live/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: n ? 'start' : 'end' }) }).catch(() => {}); }} style={{ flex: '0 0 auto', padding: '7px 12px', borderRadius: 999, border: '1px solid rgba(255,255,255,.6)', background: live ? '#ffffff' : 'rgba(255,255,255,.14)', color: live ? '#111' : '#fff', fontFamily: 'system-ui', fontSize: 12, fontWeight: 700 }}>{live ? 'Stop live' : 'Live'}</button>
          </div>
          <form onSubmit={(e) => { e.preventDefault(); tellLea(cmd); }} style={{ display: 'flex', gap: 8 }}>
            <input value={cmd} onChange={(e) => setCmd(e.target.value)} placeholder="Parle à Léa…" style={{ flex: 1, padding: '10px 14px', borderRadius: 999, border: '1px solid rgba(255,255,255,.18)', background: 'rgba(0,0,0,.55)', color: '#fff', fontFamily: 'system-ui', fontSize: 14, outline: 'none' }} />
            <button type="submit" disabled={busy} style={{ padding: '0 16px', borderRadius: 999, border: 0, background: busy ? 'rgba(255,255,255,.2)' : '#ffffff', color: busy ? '#fff' : '#111', fontFamily: 'system-ui', fontSize: 14, fontWeight: 700 }}>{busy ? '…' : '→'}</button>
          </form>
        </div>
      )}
      {/* Navigation entre pièces : carte = bouton 🗺️ bas-gauche (ci-dessus) + PORTES 3D sur les murs (tap scène). */}

      {/* CARTE type GTA : saute direct dans une salle (amis surlignés) */}
      {mapOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 14, background: 'rgba(5,5,9,.93)', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '16px 14px 8px', color: '#fff', fontFamily: 'system-ui' }}>
            <b style={{ flex: 1 }}>️ Plan des pièces ({rooms.length})</b>
            <button onClick={() => setMapOpen(false)} style={{ width: 34, height: 34, borderRadius: 999, border: 0, background: 'rgba(255,255,255,.18)', color: '#fff', fontSize: 17 }}>×</button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '0 8px 28px', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 3 }}>
            {rooms.map((r, i) => (
              <button key={r.userId + i} onClick={() => goRoom(i)} style={{ position: 'relative', aspectRatio: '1', overflow: 'hidden', padding: 0, borderRadius: 8, border: i === curIndex ? '2px solid #ffffff' : '1px solid rgba(255,255,255,.08)', background: '#16161e' }}>
                {r.avatar
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={r.avatar} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                  : <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg,#3a2a55,#1a1a26)', color: '#fff', fontFamily: 'system-ui', fontSize: 26, fontWeight: 700 }}>{(r.name || '?')[0].toUpperCase()}</span>}
                <span style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '5px 6px', background: 'linear-gradient(transparent,rgba(0,0,0,.85))', color: '#fff', fontFamily: 'system-ui', fontSize: 10, fontWeight: 600, textAlign: 'left', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name}</span>
                {r._friend && <span style={{ position: 'absolute', left: 5, top: 5, fontSize: 9, padding: '1px 5px', borderRadius: 999, background: '#d4d4d8', color: '#012', fontFamily: 'system-ui', fontWeight: 700 }}>ami</span>}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Bibliothèque d'animations : la liste s'adapte aux fichiers présents */}
      {animPanel && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 12, background: 'rgba(0,0,0,.8)', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '16px 14px 10px', color: '#fff', fontFamily: 'system-ui' }}>
            <b style={{ flex: 1 }}>Animations ({animList.length})</b>
            <button onClick={() => setAnimPanel(false)} style={{ width: 34, height: 34, borderRadius: 999, border: 0, background: 'rgba(255,255,255,.18)', color: '#fff', fontSize: 17 }}>×</button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '0 12px 28px' }}>
            {animList.length === 0 && <div style={{ color: '#fff', opacity: 0.6, fontFamily: 'system-ui', fontSize: 13, padding: 12 }}>Aucune animation trouvée. Dépose des .fbx Mixamo.</div>}
            {animList.map((f) => (
              <button key={f.name} onClick={() => { animPlayRef.current(f.name); setAnimPanel(false); }}
                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '13px 14px', marginBottom: 8, borderRadius: 12, border: '1px solid rgba(255,255,255,.12)', background: 'rgba(255,255,255,.06)', color: '#fff', fontFamily: 'system-ui', fontSize: 14, fontWeight: 600 }}>
                ️ {f.name.replace(/\.(fbx|glb)$/i, '')}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Overlay commentaires LIVE — même canal `live:{liveId}` que le WebRTC.
          Diffuseur (ma salle, live ON) OU spectateur (le proprio est en direct). */}
      {live && isMyRoom && rooms[curIndex]?.userId && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9, pointerEvents: 'none' }}>
          <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
            <LiveComments liveId={rooms[curIndex]!.userId} canComment insetBottom={132} />
            {/* LIVE SHOPPING (diffuseur) : épingler + aperçu de la card épinglée. */}
            <LiveProductPicker liveId={rooms[curIndex]!.userId} />
            <LiveProducts liveId={rooms[curIndex]!.userId} canBuy={false} insetBottom={198} />
          </div>
        </div>
      )}
      {watchLiveId && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9, pointerEvents: 'none' }}>
          <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
            <LiveComments liveId={watchLiveId} canComment announceJoin insetBottom={24} />
            {/* LIVE SHOPPING (spectateur) : la card produit épinglée + son bouton Acheter. */}
            <LiveProducts liveId={watchLiveId} canBuy insetBottom={90} />
          </div>
        </div>
      )}
    </main>
  );
}
