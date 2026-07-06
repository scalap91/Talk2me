// Mobilier procédural de la pièce 3D (Phase 2.2).
// Palette CHAUDE & PREMIUM (lin/beige, noyer, greige) — assez claire pour
// ressortir contre les murs sombres de la pièce. Sobre, pas tape-à-l'œil.
/* eslint-disable @typescript-eslint/no-explicit-any */
export function buildRoomFurniture(THREE: any) {
  const group = new THREE.Group();

  // Teintes partagées
  const LIN = 0xb8a892;     // tissu canapé (lin chaud)
  const NOYER = 0x7a5638;   // bois noyer (table, étagère, accoudoirs)
  const GREIGE = 0x8a7d6e;  // tapis
  const METAL = 0x3a3a40;   // pieds métal sombre

  // --- 1. TAPIS rectangulaire ---
  const tapisMat = new THREE.MeshStandardMaterial({ color: GREIGE, roughness: 0.95 });
  const tapis = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 2.2), tapisMat);
  tapis.rotation.x = -Math.PI / 2;
  tapis.position.set(-1.5, 0.02, -2.4);
  tapis.receiveShadow = true;
  group.add(tapis);

  // --- 2. CANAPÉ 3 places (contre mur gauche x≈-4.3) ---
  const canapeGroup = new THREE.Group();
  canapeGroup.position.set(-4.1, 0, -2.0);

  const assiseMat = new THREE.MeshStandardMaterial({ color: LIN, roughness: 0.85 });
  const assise = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.45, 0.95), assiseMat);
  assise.position.set(0, 0.42, 0);
  assise.castShadow = true; assise.receiveShadow = true;
  canapeGroup.add(assise);

  const dossier = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.7, 0.18), assiseMat);
  dossier.position.set(0, 0.78, -0.45);
  dossier.castShadow = true; dossier.receiveShadow = true;
  canapeGroup.add(dossier);

  // Coussins (deux, légèrement plus clairs)
  const coussinMat = new THREE.MeshStandardMaterial({ color: 0xc8bba8, roughness: 0.8 });
  [-0.65, 0.65].forEach((x) => {
    const c = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.18), coussinMat);
    c.position.set(x, 0.78, -0.32); c.rotation.z = x < 0 ? 0.08 : -0.08;
    c.castShadow = true; canapeGroup.add(c);
  });

  const boisMat = new THREE.MeshStandardMaterial({ color: NOYER, roughness: 0.6 });
  const accG = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.55, 0.95), boisMat);
  accG.position.set(-1.3, 0.48, 0); accG.castShadow = true; canapeGroup.add(accG);
  const accD = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.55, 0.95), boisMat);
  accD.position.set(1.3, 0.48, 0); accD.castShadow = true; canapeGroup.add(accD);

  const piedMat = new THREE.MeshStandardMaterial({ color: METAL, roughness: 0.5, metalness: 0.4 });
  [[-1.1, 0.1, -0.4], [1.1, 0.1, -0.4], [-1.1, 0.1, 0.4], [1.1, 0.1, 0.4]].forEach((pos) => {
    const pied = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.2, 8), piedMat);
    pied.position.set(pos[0], pos[1], pos[2]); pied.castShadow = true; canapeGroup.add(pied);
  });
  group.add(canapeGroup);

  // --- 3. TABLE BASSE devant le canapé ---
  const tableGroup = new THREE.Group();
  tableGroup.position.set(-1.5, 0, -2.4);
  const plateau = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.06, 0.75), boisMat);
  plateau.position.set(0, 0.42, 0); plateau.castShadow = true; plateau.receiveShadow = true;
  tableGroup.add(plateau);
  [[-0.55, 0.1, -0.3], [0.55, 0.1, -0.3], [-0.55, 0.1, 0.3], [0.55, 0.1, 0.3]].forEach((pos) => {
    const pied = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.4, 8), piedMat);
    pied.position.set(pos[0], pos[1], pos[2]); pied.castShadow = true; tableGroup.add(pied);
  });
  // petit livre déco sur la table
  const livre = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.05, 0.28),
    new THREE.MeshStandardMaterial({ color: 0x9c5a45, roughness: 0.7 }));
  livre.position.set(0.1, 0.475, 0); livre.castShadow = true; tableGroup.add(livre);
  group.add(tableGroup);

  // --- 4. LAMPADAIRE (coin arrière-droit) — source chaude cosy ---
  const lampeGroup = new THREE.Group();
  lampeGroup.position.set(3.8, 0, -4.4);
  const piedLampeMat = new THREE.MeshStandardMaterial({ color: METAL, roughness: 0.4, metalness: 0.6 });
  const piedLampe = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.07, 1.9, 10), piedLampeMat);
  piedLampe.position.set(0, 0.95, 0); piedLampe.castShadow = true; lampeGroup.add(piedLampe);
  const abatMat = new THREE.MeshStandardMaterial({ color: 0xf2e3c4, roughness: 0.6, emissive: 0xffd9a0, emissiveIntensity: 0.9 });
  const abat = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.18, 0.45, 18), abatMat);
  abat.position.set(0, 2.0, 0); lampeGroup.add(abat);
  const lampeLight = new THREE.PointLight(0xffd2a1, 18, 11, 1.8);
  lampeLight.position.set(0, 1.95, 0);
  lampeLight.castShadow = true;
  lampeLight.shadow.mapSize.width = 512; lampeLight.shadow.mapSize.height = 512;
  lampeGroup.add(lampeLight);
  group.add(lampeGroup);

  // --- 5. PLANTE en pot (coin arrière-gauche) ---
  const planteGroup = new THREE.Group();
  planteGroup.position.set(-4.3, 0, -4.4);
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.2, 0.45, 14),
    new THREE.MeshStandardMaterial({ color: 0xb89a78, roughness: 0.7 }));
  pot.position.set(0, 0.22, 0); pot.castShadow = true; pot.receiveShadow = true; planteGroup.add(pot);
  const tige = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.7, 6),
    new THREE.MeshStandardMaterial({ color: 0x3a5a2a, roughness: 0.8 }));
  tige.position.set(0, 0.6, 0); tige.castShadow = true; planteGroup.add(tige);
  const feuilleMat = new THREE.MeshStandardMaterial({ color: 0x4e7a3a, roughness: 0.9 });
  const f1 = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.45, 8), feuilleMat);
  f1.position.set(0, 1.05, 0); f1.castShadow = true; planteGroup.add(f1);
  const f2 = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 8), feuilleMat);
  f2.position.set(0.18, 0.85, 0.12); f2.castShadow = true; planteGroup.add(f2);
  const f3 = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 8), feuilleMat);
  f3.position.set(-0.15, 0.92, -0.1); f3.castShadow = true; planteGroup.add(f3);
  group.add(planteGroup);

  // --- 6. ÉTAGÈRE basse contre mur du fond ---
  const etagereGroup = new THREE.Group();
  etagereGroup.position.set(0, 0, -5.6);
  const etagere = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.85, 0.42), boisMat);
  etagere.position.set(0, 0.42, 0); etagere.castShadow = true; etagere.receiveShadow = true;
  etagereGroup.add(etagere);
  // séparation horizontale (plateau du milieu, ton plus clair)
  const sep = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.04, 0.42),
    new THREE.MeshStandardMaterial({ color: 0x9c7450, roughness: 0.6 }));
  sep.position.set(0, 0.42, 0.01); etagereGroup.add(sep);
  const objColors = [0xc8bba8, 0x9c5a45, 0x6e8aa0];
  [[-0.55, 0x0, 0.2, 0.15, 0.2], [0.0, 0x0, 0.15, 0.22, 0.15], [0.55, 0x0, 0.25, 0.13, 0.18]].forEach((b, i) => {
    const o = new THREE.Mesh(new THREE.BoxGeometry(b[2] as number, b[3] as number, b[4] as number),
      new THREE.MeshStandardMaterial({ color: objColors[i], roughness: 0.6 }));
    o.position.set(b[0] as number, 0.85 + (b[3] as number) / 2, 0.05); o.castShadow = true; etagereGroup.add(o);
  });
  group.add(etagereGroup);

  return group;
}
