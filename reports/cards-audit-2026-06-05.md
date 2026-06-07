# Audit rendering cards Talk2Me — 2026-06-05

Audit pur lecture + curl, AUCUNE modif de code. Serveur live : PM2 `talktome` sur port 3010 (Next.js prod, Node 20.20.2).

Pipeline testé : `URL → /api/embed-hub → registry → extractor → UnifiedCard → UnifiedCardRenderer`.

---

## Matrice résultats

Légende :
- `API` = HTTP 200 + JSON valide depuis `/api/embed-hub?url=...`
- `Card` = `source` réel renvoyé (pas fallback) ET `validateUnifiedCard` ok (title + external_url + actions)
- `Embed` = `embed.kind` présent ET ressource embeddable (`src` ou `srcdoc`)
- `Render` = comportement attendu dans `UnifiedCardRenderer.tsx` (condition L131 : `!card.embed || source==='fallback'` → `FallbackCard`)
- `Verdict` : OK = card riche embeddée / FALLBACK = card dégradée mais propre (lien + parfois thumb) / BROKEN = invisible ou cassé visuellement

| Extractor              | API | Card riche | Embed live | Render attendu | Verdict |
|------------------------|-----|------------|------------|----------------|---------|
| youtube                | 200 | OK         | iframe     | iframe 16/9    | **OK** |
| tiktok (long /@user/video/) | 200 | OK    | iframe     | iframe 9/16    | **OK** |
| tiktok (short vm.tiktok.com/) | 200 | OK conditionnel | iframe | iframe 9/16 | **BUG cache** (cf. bug #1) |
| spotify (track id réel) | 200 | OK title+thumb | iframe | iframe 152px | **OK** |
| spotify (album ID invalide) | 200 | titre générique | iframe → 404 chez Spotify | iframe vide | **BROKEN visuellement** (cf. bug #6) |
| soundcloud             | 200 | OK title+thumb | iframe | iframe 166px | **OK** |
| apple-music (album)    | 200 | titre slugifié | iframe | iframe 450px | **OK** mais titre pauvre |
| deezer (track)         | 200 | titre `Deezer · track 3135556` | iframe | iframe 92px | **DÉGRADÉ** (aucun appel oEmbed) |
| vimeo                  | 200 | titre générique `Vimeo · 76979871` | iframe | iframe 16/9 | **DÉGRADÉ** (oEmbed Vimeo ne marche pas pour cet ID public, possible 401) |
| dailymotion (ID valide x9bv3xs) | 200 | OK title+thumb | iframe | iframe 16/9 | **OK** |
| dailymotion (x2hwqn9 vieille demo) | 200 | titre générique | iframe | iframe 16/9 | **OK** (vidéo possiblement supprimée mais embed reste valable) |
| twitch (video VOD)     | 200 | titre générique | iframe | iframe 16/9 | **BROKEN prod** (cf. bug #2 `parent=localhost`) |
| twitch (channel)       | 200 | titre générique | iframe | iframe 16/9 | **BROKEN prod** (cf. bug #2 `parent=localhost`) |
| loom                   | 200 | titre générique | iframe | iframe 16/9 | **DÉGRADÉ** (pas d'oEmbed Loom = OK doctrinalement, mais titre vide) |
| twitter / X (oEmbed OK, jack@20) | 200 | OK | custom srcdoc | iframe srcDoc | **OK** |
| twitter / X (oEmbed KO, ex. Twitter@1445...) | 200 | titre `Tweet @Twitter` | aucun embed | **FallbackCard** | **DÉGRADÉ** (lien sans thumb) |
| facebook (photo, post, video) | 200 | titre générique | iframe plugin | iframe | **OK techniquement**, MAIS iframe FB demande SDK initialisé + autorise X-Frame uniquement domaines whitelistés (cf. bug #3) |
| instagram              | 200 | titre générique | iframe /embed/captioned/ | iframe | **OK** (Instagram autorise /embed/) |
| linkedin (URN extractible) | 200 | titre générique | iframe | iframe 540px | **BROKEN prod** (cf. bug #4 X-Frame-Options sur certains URN) |
| pinterest              | 200 | titre+thumb via oEmbed | aucun embed | **FallbackCard** (thumb visible) | **DÉGRADÉ par design** (pas d'iframe Pinterest officielle) |
| reddit                 | 200 | titre `r/programming` | iframe | iframe 500px | **OK** mais titre fallback `r/programming` si JSON Reddit timeout (User-Agent strict) |
| maps (avec @lat,lng)   | 200 | OK extraction nom + coords | iframe | iframe 16/9 | **OK** |
| maps (sans coords, URL place texte) | 200 | OK nom uniquement | aucun embed | **FallbackCard** | **DÉGRADÉ par design** |
| article (Wikipedia)    | 200 | title+thumb via /api/og | aucun embed | **type=article** → bouton "Lire" + ArticleReader modal | **OK** |
| pdf (example.com/test.pdf) | 200 | fallback `og_empty` | aucun embed | **FallbackCard** sans thumb | **DÉGRADÉ** (lien seul) |
| image (CDN direct)     | 200 | fallback `og_empty` | aucun embed | **FallbackCard** sans thumb | **BROKEN UX** (cf. bug #5 — lien Unsplash brut au lieu d'afficher l'image) |

---

## Top bugs trouvés

### Bug #1 — SERVER_CACHE empoisonne les fallbacks transitoires (CRITIQUE)

**Fichier** : `app/api/embed-hub/route.ts:42-49,77`

```ts
function writeServerCache(url: string, card: UnifiedCard) { ... }
// L77 : writeServerCache(url, card);
```

Le cache 5 min process-local **écrit toutes les cards retournées, y compris les fallbacks**. Conséquence reproduite live :
- 1er appel `vm.tiktok.com/ZNRv1WvPW/` → tiktok-resolve transitoirement KO (cold start, latence réseau, etc.) → fallback `resolve_failed` mis en cache 5 min
- Pendant 5 min, **chaque retest renvoie le fallback même si tiktok-resolve marche maintenant** (`cached:true`)
- Test reproductible : URL `?fresh=...` passe en 545 ms ; URL pure renvoie fallback caché à 27 ms

**Fix recommandé (Pascal validera)** : ne PAS mettre en cache les cards `meta.fallback === true`, ou TTL court (30 s) pour les fallbacks vs 5 min pour les succès.

### Bug #2 — Twitch `parent=localhost` cassé en prod (CRITIQUE)

**Fichier** : `lib/embed-hub/extractors/twitch.ts:27-32`

```ts
let parent = 'talk2me.fr';
try { parent = new URL(ctx.baseUrl).hostname || parent; }
```

`ctx.baseUrl` provient de `new URL(req.url).origin` (route.ts:75). Dans nos tests live `Host: 127.0.0.1:3010`, donc `parent=127.0.0.1`. En prod via nginx, `req.url` sera l'URL interne (probablement `127.0.0.1:3010` ou `localhost:3010`), pas `talk2me.fr`.

L'iframe Twitch renvoie **erreur 2000 "Embedding parent not whitelisted"** quand le hostname dans `parent=` ne matche pas `Origin` du chargement. La whitelist Twitch exige `parent=talk2me.fr` ou `parent=www.talk2me.fr`.

**Conséquence live** : page `/demo-unified-hub` chargée depuis `talk2me.fr` envoie iframe `player.twitch.tv/?...&parent=127.0.0.1` → **erreur Twitch, écran noir**.

**Fix recommandé** : `parent` doit refléter le **hostname public** de la page hôte (Host header de la requête ENTRANTE depuis nginx, pas baseUrl interne). Pascal validera la stratégie : env var `PUBLIC_HOSTNAME=talk2me.fr` ou parse `x-forwarded-host`.

### Bug #3 — Facebook plugin iframe inutilisable en pratique (MAJEUR)

**Fichier** : `lib/embed-hub/extractors/facebook.ts:70-72`

```ts
const pluginUrl = `https://www.facebook.com/plugins/${pluginPath}?href=${encodeURIComponent(canonicalUrl)}&width=500&show_text=true`;
```

L'API retourne bien une iframe `facebook.com/plugins/post.php?...`, MAIS :
1. Facebook applique `X-Frame-Options: ALLOW-FROM` strict avec une whitelist des `App Domains` configurés dans l'app FB Business → la page `talk2me.fr` n'est pas whitelistée
2. Sans SDK FB JS chargé sur la page parente, le plugin affiche souvent une page vide ou un placeholder
3. Le résolveur ne suit pas les redirects pour `facebook.com/photo/?fbid=...` (URL canonique du test), il l'envoie tel quel au plugin → plugin FB refuse

**Conséquence live** : iframe rendue, mais contenu **blanc/erreur côté Facebook**. UnifiedCardRenderer ne détecte pas l'échec (pas de `onError` déclenché par X-Frame-Options en silence).

**Fix recommandé** : détecter via heuristique si l'iframe est cassée (postMessage timeout, ou utiliser oEmbed FB officiel `graph.facebook.com/oembed_post` qui exige access token) → fallback vers thumbnail OG.

### Bug #4 — LinkedIn URN inventés par regex (MAJEUR)

**Fichier** : `lib/embed-hub/extractors/linkedin.ts:26-29`

```ts
const activityIdInSlug = url.match(/activity-([0-9]+)/i);
if (activityIdInSlug) return `urn:li:activity:${activityIdInSlug[1]}`;
```

L'URL test `linkedin.com/posts/williamhgates_we-need...activity-7012345678-abcd` → l'extractor produit `urn:li:activity:7012345678`. Mais cet URN est synthétique, basé sur les chiffres trouvés. LinkedIn `linkedin.com/embed/feed/update/urn:li:activity:7012345678` renvoie alors **404 ou page d'erreur** côté iframe.

De plus, LinkedIn refuse l'embed sans cookie session pour la plupart des URN privés.

**Conséquence live** : iframe LinkedIn → écran blanc/erreur 404, aucun fallback déclenché.

**Fix recommandé** : valider l'URN extrait via une requête tête (HEAD) au endpoint embed, ou simplement passer en `social_post` sans embed → FallbackCard avec lien.

### Bug #5 — Image directe = FallbackCard SANS image affichée (MAJEUR)

**Fichier** : `lib/embed-hub/extractors/article.ts:18,28` + `components/embed-hub/FallbackCard.tsx`

URL `https://images.unsplash.com/photo-1` n'a pas d'Open Graph → `article` extractor retourne `og_empty` → `buildFallbackCard` produit une card sans thumbnail (`thumbnail_url: undefined`).

`FallbackCard` ne rend `<img>` que si `card.thumbnail_url` (L19). Pour une URL pointant **directement vers une image**, on ne sait pas afficher l'image elle-même.

**Conséquence** : user partage un lien image direct → voit juste "Ouvrir ↗" sur fond noir, l'image n'apparaît jamais.

**Fix recommandé** : nouvel extractor `image` qui détecte les content-types `image/*` (via HEAD) ou les patterns connus (`*.jpg`, `*.png`, `*.webp`, hostnames `images.unsplash.com`, `i.imgur.com`, etc.), et produit une card `type=image` avec `embed.kind='image'` + render direct `<img>` dans le UnifiedCardRenderer (qui actuellement ne gère QUE `kind: 'iframe'` ou `'custom'`).

Idem PDF : aucun extractor `pdf` → fallback brut. Manque un extractor qui détecte `.pdf` et propose iframe `<embed type=application/pdf>` ou bouton de téléchargement formaté.

### Bug #6 — Spotify ID invalide passe quand même (MAJEUR)

**Fichier** : `lib/embed-hub/extractors/spotify.ts:14-15`

```ts
const SPOTIFY_REGEX = /^(?:https?:\/\/)?open\.spotify\.com\/(track|album|playlist|episode|show|artist)\/([a-zA-Z0-9]+)/i;
```

L'extractor ne **valide pas la longueur ni le format** du `spotify_id` (Spotify IDs = exactement 22 chars base62). L'URL test `open.spotify.com/album/3lKy6vIeb` (9 chars, invalide) génère :
- iframe `open.spotify.com/embed/album/3lKy6vIeb` → Spotify retourne **page d'erreur "Track not found"** dans l'iframe (silent fail)
- oEmbed prend 5058 ms à timeout (cf. trace `spotify_album_short|5058ms`) → bloque le pipeline embed-hub pendant 5 s sur cette URL

**Fix recommandé** : valider ID Spotify regex `/^[a-zA-Z0-9]{22}$/`. Si invalide → `ok:false reason:invalid_spotify_id` → fallback gracieux. Et réduire `resolverTimeoutMs` Spotify (2s suffisent).

### Bug #7 — Reddit thumbnail filtré, JSON souvent KO (MINEUR)

**Fichier** : `lib/embed-hub/extractors/reddit.ts:34-37,50-52`

L'extractor appelle `reddit.com/r/X/comments/Y/Z.json?raw_json=1` avec User-Agent custom. Reddit rate-limite agressivement les UA non-vérifiés → souvent 429/403, JSON skip, on tombe sur le titre fallback `r/<sub>` (sans titre réel).

De plus, l'iframe `embed.reddit.com/...` envoie `X-Frame-Options: SAMEORIGIN` sur certaines URLs (selon politique Reddit), donc l'iframe peut être vide même quand l'API marche.

**Fix recommandé** : remonter à un endpoint `/api/reddit-resolve` côté serveur avec User-Agent rotatif, et fallback OG/thumbnail si l'API échoue. Le test live retourne `r/programming` même quand le post est `abc123` (fake) → confirme que JSON n'a pas été lu.

### Bug #8 — Vimeo/Loom/Deezer/Apple : titres pauvres sans oEmbed (MINEUR)

- **Vimeo** : oEmbed appelé mais retourne titre générique → suggère que oEmbed Vimeo refuse les calls sans Referer ou avec UA Node natif
- **Loom** : aucun appel oEmbed → titre `Loom · <id>` brut
- **Deezer** : aucun appel oEmbed (commentaire `pas d'oEmbed simple`) → titre `Deezer · track 3135556`
- **Apple Music** : pas d'oEmbed disponible, titre via slugToTitle (`Dawn Fm` au lieu de `Dawn FM`)

**Fix recommandé** : ajouter `User-Agent: Mozilla/5.0` + `Referer: https://talk2me.fr` sur tous les oEmbed (déjà fait pour Twitter/Pinterest, à propager). Deezer a un oEmbed à `https://api.deezer.com/oembed?url=...`.

### Bug #9 — TikTok shortcode `vm.tiktok.com/ZNRv1WvPW` sans slash final (MINEUR)

**Fichier** : `lib/embed-hub/extractors/tiktok.ts:13`

Le regex `TIKTOK_SHORT` accepte avec ou sans slash, mais le test renvoyait `data:{}` quand tiktok-resolve recevait l'URL sans slash final → `no_video_id_in_resolved_url` (TikTok redirige vers homepage). Edge case rare.

### Bug #10 — Variant `fullscreen-feed` + embed `height:` (non `aspect_ratio`) = render cassé (MINEUR)

**Fichier** : `components/embed-hub/UnifiedCardRenderer.tsx:182-194`

Cards Spotify/Deezer/SoundCloud/Reddit/LinkedIn ont `embed.height` (pas `aspect_ratio`). Le code L182 utilise `style={height: isFullscreen ? '100%' : card.embed.height}`. En fullscreen-feed, force `100%` qui peut couper le widget (ex. Spotify album 380px stretché en plein écran montre des bandes blanches).

**Fix recommandé** : pour ces sources audio, garder leur hauteur fixe même en fullscreen, ou switcher en card mode (header + actions) sans plein écran.

---

## Render attendu (synthèse UnifiedCardRenderer)

Le renderer (L131-134) bascule en **FallbackCard** si :
- `!card.embed` (Pinterest, maps sans coords, Twitter oEmbed KO, fallback)
- `embedError` (jamais déclenché sur X-Frame-Options refus ; bug silencieux)
- `source === 'fallback'` (pdf, image direct, og_empty)

**FallbackCard** affiche : `<img thumbnail>` si présent + titre + lien "Ouvrir". Sans thumb → écran texte sans aperçu visuel.

---

## Top recommandations fix (ordre de priorité)

1. **Bug #1 (CRITIQUE)** — `app/api/embed-hub/route.ts:42` : ne pas cacher les fallbacks (ou TTL 30 s pour `meta.fallback===true`). Sinon une seule erreur transitoire condamne la card 5 min.
2. **Bug #2 (CRITIQUE)** — `lib/embed-hub/extractors/twitch.ts:27` : `parent=` doit être le hostname **public** (env var ou x-forwarded-host), pas `baseUrl` interne. Sinon Twitch = écran noir en prod.
3. **Bug #5 (MAJEUR)** — créer un extractor `image` qui détecte content-type image et render `<img>` direct (UnifiedEmbed `kind:'image'` à ajouter au types.ts). Pareil pour PDF.
4. **Bug #6 (MAJEUR)** — `lib/embed-hub/extractors/spotify.ts:15` : valider `id` longueur 22 chars + timeout oEmbed 2 s. Sinon URL invalide bloque 5 s puis affiche iframe vide.
5. **Bug #4 (MAJEUR)** — `lib/embed-hub/extractors/linkedin.ts:26` : ne pas inventer d'URN depuis les chiffres du slug ; valider via HEAD ou produire card sans embed.
6. **Bug #3 (MAJEUR)** — Facebook plugin nécessite SDK ou whitelist domain. Ajouter heuristique de détection d'échec ou switcher sur thumbnail OG si le href n'a pas été canonicalisé.
7. **Bug #7 (MINEUR)** — Reddit : créer `/api/reddit-resolve` server-side avec UA rotatif. Ou simplifier : appeler `reddit.com/...&pretty=1` directement.
8. **Bug #8 (MINEUR)** — propager UA `Mozilla/5.0 + Referer talk2me.fr` sur tous les oEmbed. Ajouter Deezer oEmbed `api.deezer.com/oembed`.
9. **Bug #10 (MINEUR)** — variant `fullscreen-feed` : ne pas stretcher `height` audio sources, garder dimensions natives.

---

## Tests UI (limités côté serveur sans browser)

- `/home` redirige vers `/signin` (gate auth middleware) → impossible de tester sans cookie
- `/demo-unified-hub` est **public** (whitelist middleware L51), accessible, HTTP 200, charge le composant client `DemoUnifiedHub` qui fait `Promise.all(17 URLs)` côté navigateur. Pas d'erreur SSR observée dans le HTML rendu.
- Pour validation réelle, lancer Playwright sur `/demo-unified-hub` et screenshoter chaque card individuellement (à faire en suivant la doctrine `feedback_screenshot_avant_url`).

---

## Synthèse pour Pascal

**Marche bien (8/24 testés)** : youtube, tiktok long, spotify track ID valide, soundcloud, dailymotion ID valide, instagram, maps avec coords, article wikipedia, twitter oEmbed OK (jack@20).

**Marche en surface mais cassé en prod (4)** : twitch (parent invalide), facebook (X-Frame), linkedin (URN inventé), spotify album ID invalide.

**Dégradé volontairement mais montre FallbackCard sans thumb (4)** : twitter oEmbed KO, pinterest, maps sans coords, pdf.

**Cassé visuellement (1)** : image directe — montre un lien brut, n'affiche pas l'image.

**Pollution cache transitoire (concerne TOUS les extractors qui dépendent d'une API externe)** : 1 échec de oEmbed/resolver → 5 min de fallback pour cette URL. Probablement le **vrai problème UX** que Pascal observe : il a vu une card cassée hier, elle est toujours cassée aujourd'hui car cachée.

Fichiers à éditer (Pascal validera) :
- `/home/ubuntu/talktome/app/api/embed-hub/route.ts:42-49,77`
- `/home/ubuntu/talktome/lib/embed-hub/extractors/twitch.ts:27-32`
- `/home/ubuntu/talktome/lib/embed-hub/extractors/spotify.ts:15`
- `/home/ubuntu/talktome/lib/embed-hub/extractors/linkedin.ts:26-29`
- `/home/ubuntu/talktome/lib/embed-hub/extractors/facebook.ts:70-72`
- `/home/ubuntu/talktome/lib/embed-hub/extractors/reddit.ts:34-37`
- `/home/ubuntu/talktome/lib/embed-hub/registry.ts` (+ ajouter extractor `image` et `pdf`)
- `/home/ubuntu/talktome/lib/embed-hub/types.ts` (élargir `UnifiedEmbed.kind` si on ajoute `'image'` natif)
- `/home/ubuntu/talktome/components/embed-hub/UnifiedCardRenderer.tsx:182-194` (variant fullscreen + audio)
