# AR_AVATAR.md — Poser Léa (avatar 3D) dans une pièce, ancrée (sans scan complet)

> Scope (Pascal 2026-06-13) : **détection de plan → tap → placer l'avatar → reste ancré quand on bouge → Léa parle/bouge.**
> PAS de scan 3D complet, PAS de Matterport, PAS de reconstruction de volume.

---

## 0. Le point qui décide tout
**« L'avatar reste ancré quand l'utilisateur se déplace » = world-tracking 6DoF**, et ça n'existe proprement qu'en **natif : ARCore (Android) / ARKit (iOS)**.
- ❌ **WebXR** (navigateur/PWA) : testé sur le S23 FE → **non supporté** dans la WebView Capacitor, et fragile même en Chrome. À écarter pour l'ancrage.
- ❌ **Estimation de profondeur** (ce qu'on a branché, Depth Anything) : utile pour comprendre les volumes sur 1 frame, mais **n'ancre pas** quand on se déplace. Pis-aller, pas la solution.
- ✅ **Natif ARCore/ARKit** : plane detection + anchors persistants + 6DoF. **C'est la voie.**

Conséquence : la feature AR-avatar = un **module natif**, pas du web. Talk2Me étant aujourd'hui web (Next.js) + APK Capacitor (WebView), il faut soit un **plugin natif Capacitor**, soit une **brique React Native** dédiée à l'écran AR.

---

## 1. Architecture
```
Caméra téléphone (natif)
   ↓ ARCore / ARKit  → détection PLAN HORIZONTAL (sol) + tracking 6DoF
   ↓ tap écran        → raycast sur le plan → créer un ANCHOR à ce point
   ↓ charger l'avatar GLB → attaché à l'anchor (échelle réelle, ex. 1.7 m)
   ↓ moteur de rendu (Filament/SceneKit ou Three.js)  → dessine l'avatar sur le flux caméra
   ↓ l'utilisateur bouge → ARCore/ARKit met à jour la pose → l'avatar RESTE en place
   ↓ animations GLB (idle, parler/visèmes, gestes) jouées en local
```
Léa **vit dans l'anchor** : tant que l'anchor est suivi, elle reste à sa position réelle dans la pièce, on tourne autour, elle parle.

---

## 2. Bibliothèques exactes (2 voies)

### Voie A — React Native (recommandée, 1 base iOS+Android)
| Rôle | Lib |
|---|---|
| Couche AR (plans, anchors, 6DoF, GLB) | **@reactvision/react-viro** (ex-ViroReact) — wrappe ARCore **et** ARKit, supporte `ARPlane`/`ARPlaneAnchor`, modèles **GLB/glTF**, animations, hit-test au tap |
| Caméra (si UI custom hors AR) | **react-native-vision-camera** |
| App shell | React Native (écran AR dédié, lancé depuis l'app) |

→ **Une seule API** pour Android+iOS. C'est exactement ton « React Native Vision Camera + couche AR adaptée ».

### Voie B — Natif pur (si on garde Capacitor/web)
| Plateforme | Lib |
|---|---|
| Android | **ARCore** + **SceneView** (`io.github.sceneview:arsceneview`, Filament) → plans + anchors + GLB |
| iOS | **ARKit** + **RealityKit** (ou SceneKit) → `ARPlaneAnchor` + USDZ/GLB |
| Pont | **plugin Capacitor maison** qui ouvre la vue AR native depuis le web |

→ Plus lourd (2 implémentations natives + pont), mais garde l'app web telle quelle.

### Voie C — Web (écartée pour l'ancrage)
Three.js / React Three Fiber + WebXR `hit-test`/`plane-detection`. Code simple **mais** WebXR KO sur le parc visé. À réserver à un fallback desktop/Chrome.

**Reco : Voie A (React Viro)** pour l'écran AR — un seul code, ARCore+ARKit gérés, GLB natif.

---

## 3. Mobile Android
- **ARCore** (Google Play Services for AR) — plane detection horizontale, hit-test, anchors, depth optionnel.
- Rendu : **SceneView/Filament** (natif) ou via React Viro.
- Prérequis : appareil certifié ARCore (S23 FE ✅), permission caméra (déjà dans le manifest APK).
- Avatar : **GLB** chargé directement.

## 4. Mobile iPhone
- **ARKit** — `ARWorldTrackingConfiguration` + `planeDetection = .horizontal`, `ARPlaneAnchor`, hit-test au tap.
- Rendu : **RealityKit** (moderne) ou SceneKit.
- Format natif iOS = **USDZ**, mais GLB se charge via RealityKit/Viro (ou conversion GLB→USDZ à build-time).
- Pas d'app iOS native aujourd'hui chez nous → iOS = **phase 2** (la Voie A React Native le débloque d'un coup).

---

## 5. Format avatar retenu
- **GLB / glTF 2.0** = le format AR universel (ARCore SceneView, ARKit/RealityKit, Viro, Three.js). **C'est lui qu'on retient pour l'AR.**
- **VRM** = pour l'avatar stylisé in-app (blendshapes normés). Pour l'AR → **convertir VRM → GLB** (UniVRM / export Blender), en gardant le rig + blendshapes (visèmes pour parler).
- Léa AR = **un seul GLB** : mesh + squelette + animations (idle, parler, gestes) + blendshapes visèmes. Léger (quelques Mo).

---

## 6. Pipeline de rendu
```
ARCore/ARKit (pose caméra + plans + anchor)
   → moteur 3D (Filament / RealityKit / Three.js) dessine l'avatar GLB à l'anchor
   → flux caméra en fond (natif) + avatar composité par le moteur
   → animations jouées par l'AnimationMixer du moteur (idle / visèmes / gestes)
   → option : depth ARCore pour OCCLUSION (l'avatar passe derrière un meuble) — phase 2
```
**Tout tourne sur le GPU DU TÉLÉPHONE, en temps réel.** Aucun aller-retour serveur pour l'AR live.

---

## 7. Coût GPU
- **AR live (sur le téléphone)** : quasi nul côté serveur. Plane detection + 1 avatar rigué + animations = **GPU mobile**, temps réel, gratuit.
- **Notre GPU (pod RunPod)** sert UNIQUEMENT à **fabriquer/préparer l'asset** : créer le modèle Léa, le rendre photoréaliste (img2img), générer/retarget les animations, convertir VRM→GLB. **Une fois le GLB prêt, l'AR ne coûte rien en serveur.**
- Donc : **coût GPU serveur = ponctuel (préparation asset), pas par session AR.**

---

## 8. Difficulté d'intégration
| Voie | Difficulté | Pourquoi |
|---|---|---|
| **A — React Viro (RN)** | **Moyenne** | 1 API iOS+Android, mais introduit React Native dans l'écosystème (écran AR séparé du web) |
| B — Plugin Capacitor natif | Élevée | 2 implémentations natives (ARCore + ARKit) + pont web↔natif à maintenir |
| C — WebXR | Faible (code) mais **inutilisable** (pas supporté sur le parc) |

Réalité Talk2Me : l'app est **web/Capacitor**. L'AR-avatar **sort du web** → c'est le vrai investissement de cette feature (un module natif/RN). À assumer.

---

## 9. MVP vs version avancée

### MVP (Android d'abord)
1. Écran AR (React Viro) lancé depuis le Composer.
2. **ARCore** détecte le **sol** (plan horizontal) → réticule.
3. **Tap** → Léa (GLB) posée à l'anchor, **échelle réelle (~1.7 m)**.
4. **Ancrage** : on se déplace, on tourne autour, elle reste en place.
5. Léa joue une **animation idle + une animation "parler"** (visèmes) + audio.
6. Capture vidéo de la scène AR → revient dans le Composer / feed.

### Version avancée (phase 2+)
- **iOS / ARKit** (la Voie A le donne presque gratuitement).
- **Occlusion** via depth ARCore/ARKit (Léa passe derrière les meubles).
- **Lighting estimation** (Léa éclairée comme la vraie pièce → réalisme).
- **Visèmes pilotés par la voix XTTS** en temps réel (lip-sync live).
- **Léa dirigée par l'IA** (gestes/déplacements selon la demande).
- Anchors **persistants** (Cloud Anchors) pour retrouver Léa au même endroit.

---

## 10. Recommandation
- **Format : GLB** (Léa AR = un GLB rigué + visèmes).
- **Lib : React Viro** (@reactvision) — ARCore + ARKit en une API, écran AR dédié.
- **MVP : Android only**, sol + tap + ancrage + idle/parler. iOS en phase 2.
- **Serveur GPU : seulement pour préparer l'asset** (Léa GLB + animations), pas pour l'AR live.
- Le quadrillage profondeur déjà branché (Depth Anything) reste utile pour l'**occlusion** plus tard, mais **n'est pas** le mécanisme d'ancrage.

*Doc Talk2Me — 2026-06-13.*
