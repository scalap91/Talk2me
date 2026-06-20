# Moteur d'avatar MAISON — photo → avatar 3D réaliste (architecture figée)

> Objectif : générer l'avatar IA de chaque user **à partir d'une photo**, **sur notre
> GPU**, **commercialement propre**, **sans dépendre d'Avaturn/Streamoji/RPM au runtime
> ni à la création**. Figé le 2026-06-18 (Pascal). Statut : spec, pas encore implémenté.

---

## 0. Pourquoi ce doc (la vérité)
Un photo→avatar réaliste **riggé** est ce qui fait payer Avaturn (800 $/mois). Le faire
nous-mêmes est faisable **mais** = vrai chantier R&D + **décisions de licence** + un peu de
budget assets. Le piège : les meilleurs modèles académiques sont **non-commerciaux**
(FLAME, DECA, EMOCA, PIFuHD, BFM) → **interdits dans un produit qu'on vend**. Toute
l'archi ci-dessous est construite **uniquement avec des briques commercialement OK**.

---

## 1. Contraintes
- **Commercial** : chaque composant doit autoriser l'usage commercial (sinon écarté).
- **Sur notre GPU** (RunPod) : pas d'API tierce facturée à la création.
- **Sortie** : **GLB** riggé, **squelette standard** (Hips/Spine/Neck/Head/Arms/Legs —
  compatible Mixamo) + **blendshapes ARKit** → réutilise direct nos animations mocap,
  notre `/piece` (animateStreamoji) et nos sens (voix/STT/vision).
- **Hébergé chez nous** : `/uploads/streamoji/body-<userId>.glb` (déjà branché via
  `/api/avatar/import`).

---

## 2. Licences — ce qu'on PEUT / ne PEUT PAS utiliser
| Brique | ✅ Commercial OK | ❌ À bannir (non-commercial) |
|---|---|---|
| Détection visage / landmarks | **MediaPipe Face Mesh** (Apache-2.0, 468 pts) | — |
| Modèle de tête morphable | **Le nôtre** (commandé à un artiste) ou asset acheté | FLAME, BFM (CC BY-NC) |
| Reconstruction 3D depuis image | **TripoSR** (MIT), InstantMesh (à vérifier) | PIFuHD, ICON, ECON (NC) |
| Base corps riggé | **MakeHuman** (assets CC0), **Mixamo** (gratuit commercial), ou asset acheté | bases Avaturn/Streamoji (leur IP) |
| Animations | **Mixamo / RPM anim-library** (déjà utilisées) | — |
> ⚠️ Toute licence "critique" sera **reconfirmée juridiquement** avant intégration.

---

## 3. Architecture — pipeline en 5 briques

```
 PHOTO (selfie)
   │
   ▼
[B1] Détection visage (MediaPipe)  ── landmarks 468 + pose + masque peau
   │
   ▼
[B2] Ajustement de NOTRE tête morphable ── morphs (forme) fittés aux landmarks
   │                                         + teinte de peau échantillonnée
   ▼
[B3] Texture du visage ── projection/baking de la photo sur l'UV de la tête
   │                       (alignée sur les landmarks) → "c'est lui"
   ▼
[B4] Montage sur la BASE riggée ── tête → corps (squelette std + ARKit) + cheveux/tenue
   │                                (cheveux/tenue = notre bibliothèque, B5)
   ▼
[B5] Export GLB ── + blendshapes ARKit transférés → /api/avatar/import → /uploads
   │
   ▼
 /piece : animé par mocap + voix + regard (déjà en place)
```

**Niveaux de réalisme (du plus simple au plus "c'est vraiment moi") :**
- **N1 — Texture only** : base riggée fixe + photo projetée en texture (B1+B3+B4). Rapide,
  reconnaissable, 100% commercial. ← **MVP**
- **N2 — Géométrie** : on ajoute B2 (forme du visage fittée) → ressemblance forte.
- **N3 — Cheveux/tenue depuis photo** : TripoSR sur la coiffure/les habits (optionnel).

---

## 4. Briques détaillées

### B1 — Landmarks (MediaPipe, Apache-2.0)
- Endpoint GPU `/face-landmarks` : image → 468 points + transform + segmentation peau/cheveux.
- Sert à : aligner la texture (B3) et piloter les morphs (B2).

### B2 — Tête morphable À NOUS (le vrai investissement)
- On **possède** un mesh de tête neutre + un set de **blendshapes de forme**
  (largeur visage, nez, mâchoire, yeux…) + les **52 ARKit** (expressions).
- Source : **commande à un artiste 3D** (topologie propre, UV, rig) OU asset acheté
  avec licence commerciale. C'est l'élément qui nous rend **indépendants ET légaux**.
- Fit : optimisation landmarks→morphs (différentiable ou moindres carrés). Pas de FLAME.

### B3 — Texture visage
- Warp de la photo vers l'UV de la tête via les landmarks (triangulation), inpainting
  des bords (notre GPU SDXL/rembg déjà dispo) pour les zones manquantes.

### B4 — Base corps riggé
- **MakeHuman (CC0)** ou **Mixamo (commercial gratuit)** : corps humain riggé, squelette
  standard. On y greffe la tête (B2/B3). On ajoute les **blendshapes ARKit** sur la tête.
- Cheveux/tenue : **notre bibliothèque** (assets achetés/commandés/MakeHuman) — pas Streamoji.

### B5 — Assemblage + export
- Fusion tête+corps sur **un seul squelette**, merge des SkinnedMesh, matériaux
  (peau/yeux), export **GLB** (gltf-transform / trois). Réutilise `/api/avatar/import`.

---

## 5. Pipeline GPU (endpoints à ajouter au worker)
- `/face-landmarks` (MediaPipe) — léger.
- `/head-fit` (B2 : landmarks → morphs de notre tête) — moyen.
- `/avatar-assemble` (B3+B4+B5 : texture + montage + GLB) — lourd (peut tourner CPU/Blender headless).
- Réutilise l'infra worker existante (auth Bearer, b64).

---

## 6. Phasage & effort réaliste
- **P0 — Fondations (bloquant)** : obtenir la **tête morphable** + la **base corps**
  commercialement propres (commande artiste / achat / MakeHuman). *C'est le chemin critique.*
- **P1 — MVP N1 (texture)** : B1+B3+B4+B5 → "mon visage texturé sur un corps riggé à nous",
  dans la pièce. ~1–2 semaines après P0.
- **P2 — N2 (géométrie)** : B2 fit forme → ressemblance. ~2–4 semaines.
- **P3 — N3 (cheveux/tenue) + bibliothèque** : TripoSR + assets à nous. itératif.

---

## 7. Coûts à prévoir
- **Artiste 3D** (tête morphable + ARKit + UV propre) : poste principal (one-shot).
- **Assets** corps/cheveux/tenues commerciaux (ou MakeHuman = 0 €).
- **GPU** : temps de calcul (déjà le nôtre) — surveiller la charge (cf alerte capacité).

---

## 8. Décisions — LOCKÉES (Pascal 2026-06-18)
1. **Base** : ✅ **MakeHuman + ARKit** (CC0, 0 € artiste).
2. **Niveau cible** : ✅ **N1 (texture)** d'abord.
3. Budget : 0 € assets (MakeHuman CC0) ; coût = temps GPU.
4. Code : DeepSeek orienté + moi archi/intégration.

## 8bis. OÙ ça s'exécute (le sandbox de Claude n'a PAS Blender/MakeHuman/MediaPipe)
- **Production de la base (P0)** → **RunPod GPU** : installer **Blender headless** +
  **MakeHuman** (ou importer un export MakeHuman CC0) + script Python Blender
  (`make_base.py`) : rig Mixamo standard, UV visage, **ajout des 52 blendshapes ARKit**
  (transfert depuis un donneur ARKit) → export `base-<gender>.glb`.
- **B1 landmarks + N1 texture** → **GPU worker** : `mediapipe` + assembleur.
- Claude écrit les scripts/endpoints ; **l'exécution se fait sur le GPU** (pas le sandbox).

## 8ter. P0 — checklist
- [ ] Installer Blender headless + mediapipe sur le worker RunPod.
- [ ] Obtenir une base MakeHuman CC0 (corps+tête, rig game-engine→Mixamo, UV visage).
- [ ] `make_base.py` : retarget skel + **ajout ARKit blendshapes** → `base.glb`.
- [ ] `/face-landmarks` (MediaPipe) sur le worker. ← *codé, à déployer avec P0*
- [ ] `avatar_n1.py` : photo+landmarks → warp texture sur UV visage → GLB → `/api/avatar/import`.

---

## 9. Réutilisation de l'existant (rien à jeter)
- `/api/avatar/import` (GLB → corps chez nous) ✅
- `/piece` `animateStreamoji` (mocap + regard + blink/mouth) ✅
- Sens GPU `/vision /stt /tts` ✅
- Animations `/avatar-anim/*` (Mixamo/RPM) ✅
Le moteur maison **remplace seulement la fabrication du corps**, pas le reste.
