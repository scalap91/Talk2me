# AVATAR_STACK.md — Couche « tracking visage + filtres + expressions + avatar » pour Talk2Me

> Analyse stratégique (2026-06-13). Objectif : décider quelle couche basse doit devenir la **base officielle** de Talk2Me.
> Contexte produit imposé : Talk2Me = **web Next.js + PWA + APK Capacitor** (WebView du site). **Pas d'app iOS/Android native.** Doctrine : **open-source / techno interne, zéro clé payante externe**.

---

## 0. L'insight central : il y a DEUX couches, pas une

On mélange tout. En réalité il y a deux pipelines qui n'ont ni le même but, ni le même lieu d'exécution :

| | **A. TEMPS RÉEL on-device** | **B. PRÉSENTATEUR IA généré (serveur)** |
|---|---|---|
| But | La caméra de l'**user** : filtres, beauté, avatar qui mime son visage en live (façon Snap/TikTok) | **Léa** / un présentateur : vidéo générée à partir d'un texte + voix |
| Où | Navigateur / téléphone de l'user | Notre **GPU** (pod RunPod) |
| Latence | < 30 ms / frame (live) | hors-ligne (rendu de quelques secondes) |
| Brique clé | **MediaPipe** (tracking + blendshapes) + WebGL | **LivePortrait + MuseTalk** (déjà en cours) |

👉 **Recommandation de structure** : ne pas chercher UNE techno qui fait tout. Adopter **MediaPipe** comme base de la couche A, et **LivePortrait+MuseTalk** comme base de la couche B. Les deux partagent un langage commun : les **blendshapes ARKit (52)**.

---

## 1. Tracking visage

| Techno | Rôle | Licence | Mobile/Serveur | Difficulté T2M | Intérêt T2M |
|---|---|---|---|---|---|
| **MediaPipe Face Landmarker** | 468 landmarks + matrice d'orientation tête + **52 blendshapes ARKit** | **Open, gratuit (Google)** | **Navigateur (WASM) + WebView Capacitor** | **Faible** (JS/WASM, marche dans la PWA) | **★★★★★** |
| ARKit Face Tracking | landmarks + 52 blendshapes natifs | Gratuit mais **iOS only** | iOS natif uniquement | **Bloquant** (pas d'app iOS native) | ★☆☆☆☆ |
| ARCore Augmented Faces | maillage 468 pts | Gratuit mais **Android natif** | Android natif (plugin Capacitor à écrire) | Élevée (pont natif) | ★★☆☆☆ |

**Verdict tracking : MediaPipe Face Landmarker = la base officielle.** C'est le SEUL qui tourne dans notre stack actuel (PWA + WebView) sans réécriture native, il est gratuit/open, et — point capital — il sort **les 52 blendshapes compatibles ARKit** directement dans le navigateur. ARKit/ARCore ne deviennent pertinents que si un jour on fait du natif (pas le sujet).

---

## 2. Filtres temps réel

| Techno | Rôle | Licence | Mobile/Serveur | Difficulté | Intérêt T2M |
|---|---|---|---|---|---|
| **DeepAR** | filtres/maquillage/beauté clés en main | **Payant** (abonnement + watermark free) | Web SDK + mobile | Faible (SDK) mais **payant** | ★★☆☆☆ |
| **Banuba SDK** | beauté/AR haut de gamme | **Payant** (licence chère) | Web + mobile | Faible mais **payant** | ★★☆☆☆ |
| **Snap Camera Kit** | Lenses Snap | **Payant/quota + image de marque Snap** | Web + mobile | Moyenne, **dépendance Snap** | ★☆☆☆☆ |
| **NOTRE couche WebGL/Three.js sur MediaPipe** | maquillage, lunettes, barbe, beauté, overlays | **Open / à nous** | Navigateur | Moyenne (shaders + meshes alignés sur les landmarks) | ★★★★☆ |

**Verdict filtres : on NE prend AUCUN SDK payant** (DeepAR/Banuba/Snap = contre la doctrine « zéro clé externe » + coût récurrent + watermark). On **construit notre couche filtres** par-dessus les landmarks MediaPipe (WebGL/Three.js) : beauté (lissage GPU), lunettes/barbe/chapeau = meshes ancrés sur les landmarks, effets = shaders. Plus de travail, mais **à nous, gratuit, sans dépendance**.

---

## 3. Avatars 3D (avatar réutilisable de l'user)

| Techno | Rôle | Licence | Mobile/Serveur | Difficulté | Intérêt T2M |
|---|---|---|---|---|---|
| **GLB / glTF** | format 3D standard du web | **Open (Khronos)** | Navigateur (three.js) | — (format) | ★★★★☆ |
| **VRM** | avatar humanoïde standardisé (rig + blendshapes normés) | **Open** | Navigateur | Moyenne | ★★★★☆ |
| **Ready Player Me** | génération d'avatar depuis un selfie → GLB | Gratuit dev / **SaaS** (dépendance externe) | API web | Faible (mais dépendance + leur branding) | ★★★☆☆ |
| **Mixamo** | rigs + animations corps | Gratuit (Adobe, login) | Asset pipeline | Faible (assets) | ★★★☆☆ |

**Verdict 3D : pertinent mais PLUS TARD.** Un avatar 3D **réutilisable** (l'user se crée un perso qui mime ses expressions via les blendshapes MediaPipe, rendu en three.js, format **VRM/GLB**) est un super différenciateur — mais c'est un gros chantier (rig, lighting, perf mobile). On garde **VRM + GLB + three.js** comme cible (formats ouverts, pas de dépendance), Ready Player Me seulement en option d'amorçage (dépendance externe → à éviter à terme).

---

## 4. Expressions / Blendshapes — le LANGAGE COMMUN

| Élément | Réalité |
|---|---|
| **ARKit 52 blendshapes** | LE standard de facto (sourire, clignement, sourcils, mâchoire, regard…). |
| **MediaPipe** | sort **ces mêmes 52 blendshapes**, gratuitement, dans le navigateur. |
| **VRM** | consomme des blendshapes → on **branche MediaPipe → avatar VRM** directement. |
| **LivePortrait** | pilote l'expression d'un visage via un flux de mouvement (équivalent serveur). |

**Verdict : les blendshapes ARKit (52) sont la colonne vertébrale.** C'est le pivot qui relie tout : MediaPipe (capture) → filtres/avatar 3D (couche A) **et** la logique d'expression de Léa (couche B). On standardise TOUT le projet sur ce vocabulaire de 52 expressions.

---

## 5. IA Avatar moderne (présentateur généré, serveur)

| Techno | Rôle | Licence | Serveur (VRAM) | Difficulté | Intérêt T2M |
|---|---|---|---|---|---|
| **LivePortrait** | reenactment : anime un visage (tête/regard/expression) | **Open** | léger (~4-8 Go) | **Faible — déjà validé chez nous** | ★★★★★ |
| **MuseTalk** | lip-sync HD synchro à la voix | **Open** | moyen | Moyenne (deps mmcv) — **en cours d'install** | ★★★★★ |
| **Hallo / Hallo2** | portrait animé audio-driven (diffusion), très qualitatif | **Open** | lourd (lent) | Élevée | ★★★☆☆ (upgrade qualité + tard) |
| **EchoMimic V2** | audio+landmarks, demi-corps | **Open (Alibaba)** | lourd | Élevée | ★★★☆☆ (plus tard) |
| **Hunyuan Avatar** | audio-driven corps, très haute qualité | **Open (Tencent)** | **très lourd** (gros VRAM) | Très élevée | ★★☆☆☆ (plus tard, si GPU plus gros) |
| **OmniHuman-1** | full-body ultra-réaliste | **Fermé (ByteDance, API)** | — | N/A | ★☆☆☆☆ (pas open → contre doctrine) |

**Verdict IA avatar : LivePortrait + MuseTalk = le MVP serveur** (léger, tourne sur notre 4090, open). Hallo/EchoMimic/Hunyuan = **upgrades qualité plus tard** (plus lourds). OmniHuman = écarté (fermé/API payante).

---

## 6. CE QUI DOIT ÊTRE LA BASE OFFICIELLE DE TALK2ME

> **Couche A (temps réel) : MediaPipe Face Landmarker + WebGL/three.js + blendshapes ARKit(52) + format VRM/GLB.**
> **Couche B (présentateur IA) : LivePortrait + MuseTalk, sur notre GPU.**
> **Pont entre les deux : le vocabulaire des 52 blendshapes ARKit.**

100% open-source, tourne dans notre stack actuel (PWA/WebView + GPU interne), zéro clé payante, zéro dépendance propriétaire. Aligné doctrine.

---

## 7. Roadmap MVP → plus tard

**MVP (maintenant) :**
1. **Léa présentateur** : LivePortrait + MuseTalk → endpoint `/avatar_hd` → Composer (chantier en cours).
2. **MediaPipe Face Landmarker dans la PWA** : tracking + 52 blendshapes (POC caméra : on lit le visage de l'user en live).

**V2 (après MVP) :**
3. **Couche filtres maison** (WebGL sur landmarks) : beauté, lunettes, overlays — sans SDK payant.
4. **Avatar 3D VRM/GLB** piloté par les blendshapes MediaPipe : l'user a un perso qui mime son visage en live.

**Plus tard (quand GPU plus gros / besoin qualité) :**
5. Hallo2 / EchoMimic / Hunyuan Avatar pour un présentateur encore plus réaliste.
6. Pont natif ARCore (si app native un jour). ARKit jamais tant qu'on n'a pas d'iOS natif.

**Écarté (doctrine) :** DeepAR, Banuba, Snap Camera Kit (payants/propriétaires), OmniHuman (fermé), Ready Player Me en dépendance permanente.

---

## 8. Résumé en une phrase
La base officielle = **MediaPipe (tracking + 52 blendshapes) côté navigateur** pour le temps réel, **LivePortrait + MuseTalk côté GPU** pour le présentateur, **les 52 blendshapes ARKit comme langage commun**, et **VRM/GLB** comme format d'avatar — le tout open-source et interne. On ne paie aucun SDK, et tout tourne dans le stack Talk2Me actuel.
