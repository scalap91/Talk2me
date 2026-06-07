# Talk2Me — Comment ajouter des sons à la bibliothèque vidéo (#420)

La bibliothèque `/public/audio-lib/` alimente l'onglet "Musique" de
l'éditeur VideoCard.

## Tracks live à 2026-06-05 — V1

30 tracks générées procéduralement (sinusoïdes/pads/bruit avec ffmpeg),
publiées en **CC0 Talk2Me** (domaine public, aucune attribution requise,
réutilisation commerciale libre). 6 par catégorie : chill / energetic /
dramatic / lofi / ambient. ~42 Mo total à 96 kbps mono 22 kHz.

**Pourquoi des tracks procédurales et pas Pixabay/Mixkit ?**
Pixabay et Mixkit hébergent leurs MP3 derrière du Cloudflare Bot Protection
(challenge JS) qui bloque `curl`/`wget` côté serveur. FreePD.com a fermé
(2026). Pour garantir un livrable immédiat et 100% légal sans dépendre
d'API key payante ni de scraping fragile, on génère nous-même des ambiances
qui couvrent les 5 moods principaux.

C'est un **socle**. Tout est codé pour qu'on puisse remplacer/ajouter
des vraies tracks à tout moment sans toucher au code.

---

## Ajouter une track CC0/libre de droits

### Étape 1 — Récupérer le MP3

**Sources fiables CC0 ou licence commerciale gratuite sans attribution :**

- **Pixabay Music** — https://pixabay.com/music/
  - Téléchargement manuel via navigateur (compte gratuit recommandé)
  - License Pixabay = libre commercial, attribution non requise
- **Mixkit Music** — https://mixkit.co/free-stock-music/
  - Téléchargement manuel via navigateur
  - License Mixkit Free = commercial, attribution non requise
- **YouTube Audio Library** — https://studio.youtube.com/ → Audio Library
  - Filtrer par "No attribution required"
- **Free Music Archive (CC0)** — https://freemusicarchive.org/license/cc0/
  - Filtrer par license CC0 strict

⚠️ **À éviter** : tout ce qui exige attribution (CC BY) sans qu'on l'affiche
sur `/credits/audio`. Tout track non CC0 doit être documenté.

### Étape 2 — Compresser pour le bundle PWA

Pour éviter d'exploser le service worker cache (`talk2me-v43+`) :

```bash
ffmpeg -i source.mp3 -ac 1 -ar 22050 -b:a 96k chill-7.mp3
```

- Mono (`-ac 1`) : suffisant pour usage bande son arrière-plan
- 22050 Hz : qualité radio AM/FM acceptable, divise taille par 2
- 96 kbps : équilibre qualité/taille pour usage UGC

Cible : **<2 Mo par track**, total catalogue **<60 Mo**.

### Étape 3 — Placer dans la bonne catégorie

```
/public/audio-lib/
├── chill/      # détente, café, fond posé
├── energetic/  # sport, danse, motivation
├── dramatic/   # cinéma, suspense, intro
├── lofi/       # étude, focus, mellow
└── ambient/    # méditation, nature, long
```

Nommage : `<catégorie>-<numéro>.mp3` (ex `chill-7.mp3`).

### Étape 4 — Ajouter à `index.json`

```json
{
  "id": "chill-7",
  "name": "Nom affiché à l'utilisateur",
  "category": "chill",
  "duration_sec": 142,
  "file": "/audio-lib/chill/chill-7.mp3",
  "source": "Pixabay",
  "license": "Pixabay Free License",
  "bpm": 90,
  "mood": "tag libre"
}
```

Le champ `source` + `license` est affiché publiquement sur `/credits/audio`
(transparence légale).

### Étape 5 — (Optionnel) Bumper le service worker

Si on veut que les anciens users récupèrent le nouveau catalogue tout de
suite plutôt qu'à l'expiration cache :

```js
// public/sw.js
const CACHE_NAME = 'talk2me-v44'; // bump
```

Sinon, le polling Next + `index.json` revalidate naturellement (no-cache
côté handler).

---

## Workflow recommandé pour grossir le catalogue

1. **20 mn par batch** : Pascal browse Pixabay, télécharge 5 tracks par
   mood depuis le navigateur (Cloudflare ne bloque pas un humain).
2. Lance localement `./scripts/audio-lib-import.sh ~/Downloads/*.mp3 chill`
   (TODO: script utilitaire à créer si besoin).
3. Edit `index.json` (peut être automatisé : ffprobe → nom file → push).
4. `git commit -am "audio-lib: +5 tracks Pixabay chill"`.
5. Restart pm2 — index.json relu au prochain GET.

---

## Limites connues

- Les tracks V1 sont des nappes synth/pads simples : ambiance OK pour
  UGC TikTok-like, mais pas équivalent à des prods Pixabay (basse, drums,
  arrangement). Pascal peut remplacer track par track quand il a le temps,
  l'index.json est trivial à éditer.
- Pas encore de thumbnail JPG par track (le UI génère un fond gradient
  par catégorie). Ajout futur : champ `thumbnail` optionnel.
- Pas de partenariat artistes indépendants (#420.B — TODO).
