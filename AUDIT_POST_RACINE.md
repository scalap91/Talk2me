# AUDIT — La "racine" des posts/cards Talk2Me

> Auditeur technique. Inventaire factuel, AUCUNE modification. Preuves `fichier:ligne`.
> Cible : `/home/ubuntu/talktome-dev` (Next.js).
> Constat fondateur : « les posts n'ont pas la même racine ». Confirmé.

---

## 1. SCHÉMA ACTUEL (chiffres)

### Tables / modèles de données distincts pour « un post » : **5**
1. `direct_cards` — cards éditeur (image/vidéo/texte). `lib/db/direct_cards.ts`, `lib/db.ts:3839`.
2. `posts` — clips de conversation (chat). `lib/db.ts:4121`.
3. `unified_posts` — matrice « unifiée » **écrite mais JAMAIS lue** (double-write mort). `lib/db.ts:3795-3837`.
4. `deposit_annonces` (base séparée `annonces.db`) — annonces. `lib/annonces-deposit.ts`.
5. `simple_shops` / vitrines / plats — boutiques & commerce (tables commerce dédiées), exposées au feed via des markers `[VITRINE:…]` injectés dans une `direct_card`.

### Chemins de CRÉATION distincts : **6** (dont 2 ne passent PAS par `createDirectCard`)
1. `GabaritEditor` (le « + » global + Music Card + Produit) → `POST /api/cards/create`.
2. `POST /api/posts` (clip de conversation) → `createPost`.
3. `ensureRoomPost` (salle 3D `[PIECE3D]`) → **INSERT brut**, contourne `createDirectCard`. `lib/db.ts:1671`.
4. `upsertAnnonce` (annonces) → INSERT dans `annonces.db`, hors `direct_cards`/`unified_posts`.
5. Vitrine boutique → `simple-shop/[id]/vitrine` & `publish` (markers `[VITRINE:…]`).
6. `TexteCardEditor` (chemin texte legacy, voir §note) → `/api/cards/create` type `texte`.

> Doublon dangereux : **DEUX `createDirectCard`** coexistent.
> `lib/db/direct_cards.ts:55` (ne connaît PAS `attached_audio_json`, ni produit, ni unified mirror) et `lib/db.ts:3839` (la vraie). La route importe la bonne (`@/lib/db`), mais le doublon mort de `direct_cards.ts` est un piège.

### Surfaces d'AFFICHAGE distinctes : **~9**
Feed (PostShell dispatcher) + Découvrir (grille) + Profil/Mes-cards + Saved + Pièce 3D + T2M Officiel + bulles conv (UnifiedBubble/MessageBubble) + Annonces feed + Boutique/Vitrine.

### Parseurs de caption dupliqués : **3** (+ la racine ignorée = 4 implémentations)
- Racine officielle `lib/posts/parse-caption.ts:14` — **importée nulle part** (0 usage).
- Dup #1 `components/feed/ImageCardDisplay.tsx:65` (strippe les `[MARKER]`).
- Dup #2 `components/feed/VideoCardDisplay.tsx:115` (NE strippe PAS les markers).
- Dup #3 inline `components/feed/TexteCardDisplay.tsx:87-93` (ignore les `@tags`).
- Côté écriture : un 4e « parseur inverse » (build caption) dans `GabaritEditor.tsx:142-152`.

---

## 2. TABLEAU CRÉATION

| Point d'entrée | fichier:ligne | Forme produite | Passe par fn commune ? | Divergence / bug |
|---|---|---|---|---|
| Composer « + » global (Photo/Vidéo/Produit/Texte) | `components/cards/editors/GabaritEditor.tsx:181-224` ; route `app/api/cards/create/route.ts:104` | `direct_cards` (type video/image/texte) + caption assemblée + `attached_audio_json` + `attached_product_json` | ✅ `createDirectCard` (`lib/db.ts:3839`) | Caption construite ad hoc (`buildCaption` 142-152). **Audio largué si pas de média** (branche `texte` 201-208 n'envoie pas `attached_audio`). |
| Music Card « + » | `components/cards/MusicCardTab.tsx:136`, `MusicPlayerFeed.tsx:342` → `openSheet(track)` → `GabaritEditor initialSon` | idem composer | ✅ via composer | **BUG music→post** : son présélectionné mais publication impossible sans média/texte, et même avec texte l'audio est perdu. Voir §4. |
| Produit / Shop « + » (via Léa) | `lib/card-creation-store.ts:69` → `GabaritEditor initialProduct` | `direct_cards` + `attached_product_json` + `boutique_id`/`category` | ✅ via composer | OK. |
| Clip de conversation (publier extrait) | `app/api/posts/route.ts:121-161` → `createPost` `lib/db.ts:4121` | `posts` (référence `message_ids`, **pas** de media_url/caption/text) | ✅ `createPost` (mais ≠ createDirectCard) | Modèle TOTALEMENT différent : pas de caption, le rendu lit les messages. 2e racine. |
| Salle 3D `[PIECE3D]` | `lib/db.ts:1671` `ensureRoomPost` | `direct_cards` type=image, `caption = "<tagline> [PIECE3D]"`, **INSERT brut** | ❌ contourne `createDirectCard` | Pas d'indexation `card_search`, mirror unified appelé à la main (1685/1691). Marker dans caption = couplage caché. |
| Annonces | `lib/annonces-deposit.ts:60` `upsertAnnonce` | `deposit_annonces` (annonces.db) : title/description/category/price/city/image/lat/lng | ❌ base + modèle propres | N'apparaît ni dans `direct_cards`, ni `unified_posts`, ni `card_search`, ni le feed Hub. Univers isolé. |
| Vitrine boutique | `app/api/simple-shop/[id]/vitrine/route.ts`, `publish/route.ts` | `direct_cards` avec marker `[VITRINE:<shopId>]` dans caption | partiel | Couplage par string dans caption (parsé au render via regex). |
| (legacy) Card texte directe | `app/creer/texte/page.tsx`, `components/cards/editors/TexteCardEditor.tsx` | `direct_cards` type=texte | ✅ `/api/cards/create` | Coexiste avec le chemin texte du composer (deux entrées pour le même type). |

**Markers techniques** (`[PIECE3D]`, `[PANO360]`, `[LEA360]`, `[VITRINE:…]`) : encodés DANS la string `caption` et déduits au render par regex. Centralisé seulement côté écriture/lecture unified (`unifiedPostType` `lib/db.ts:3787-3793`) mais re-détecté à la main dans `PostShell.tsx:46-51` et re-strippé seulement par ImageCardDisplay.

---

## 3. TABLEAU AFFICHAGE

| Surface | fichier:ligne | Composant qui rend | Utilise PostText/parseCaption racine ? | Divergence / bug |
|---|---|---|---|---|
| Feed (dispatcher) | `components/feed/PostShell.tsx:36-176` | route vers PostCard / Video / Image / Texte / Boutique / Vitrine + overlays 3D | n/a (dispatcher) | Re-détecte les markers à la main (46-51). **Porte 3D gatée** par `piece3dOn` (47) → invisible par défaut. Voir §5bis. |
| Image card | `components/feed/ImageCardDisplay.tsx:135,181,189` | `ImageCardDisplay` | `PostTitle/PostMeta` ✅ MAIS `parseCaption` **local** (65) | Parseur dupliqué qui strippe les markers (73) — seul à le faire. |
| Vidéo card | `components/feed/VideoCardDisplay.tsx:179,352,388` | `VideoCardDisplay` | `PostTitle/PostMeta` ✅ MAIS `parseCaption` **local** (115) | Parseur dupliqué NE strippe PAS les markers → un `[VITRINE:…]` mal placé pourrait fuiter à l'écran. |
| Texte card | `components/feed/TexteCardDisplay.tsx:87-93,109,115` | `TexteCardDisplay` | `PostTitle/PostMeta` ✅ MAIS parser **inline** (87) | 3e parseur ; ignore `@tags` (pas de `PostMeta tags`). |
| Clip conversation | `components/feed/PostCard.tsx` | `PostCard` (rend les messages) | ❌ (pas de caption) | Racine d'affichage totalement séparée (rend `message_ids`). |
| Découverte / RECHERCHE in-app | `app/decouvrir/page.tsx:100-112` | grille maison `<img>/<video>` | ❌ aucun (ni PostText, ni parseCaption) | **BUG recherche** : n'affiche QUE la miniature, pas de titre/texte ; **droppe les cards texte** (filtre `it.media_url` 37). Voir §5. |
| Profil / Mes-cards | `app/mes-cards/*`, `app/profile/*` | (réutilise les *CardDisplay) | hérite des dups | Idem dups ci-dessus. |
| Saved | `app/saved-cards/page.tsx` | `SearchResultCard` + displays | partiel | Mélange composants. |
| Pièce 3D (salle) | `app/piece/page.tsx:59,308,314` | rendu salle ; **parse caption à la main** (`replace(/\[[A-Z0-9]+\]/g…)` 314) | ❌ 4e endroit qui strippe les markers | Encore une regex marker ad hoc. |
| Annonces | `components/feed/AnnoncesFeed.tsx`, `AnnonceDetailSheet.tsx` | composants annonces dédiés | ❌ (modèle deposit_annonces) | Champs structurés, rien à voir avec caption. |
| T2M Officiel / Léa (recherche) | `components/cards/SearchResultCard.tsx` | liste web search | ❌ (web, pas posts internes) | Sans rapport avec les cards internes. |

---

## 4. BUG « music → post » : impossible de publier un post avec une musique

**Cause racine (double) :**

1. **Le composer largue l'audio sur le chemin texte.** `components/cards/editors/GabaritEditor.tsx:191-208` :
   - branche `mediaUrl` présent (191-200) → envoie bien `attached_audio: son`.
   - branche **sans média** (201-208, type `texte`) → **n'envoie PAS `attached_audio`**.
   Donc un post « juste une musique + un mot » perd la musique.

2. **L'API refuse l'audio hors média.** `app/api/cards/create/route.ts:71-83` : `attachedAudioJson` n'est calculé que si `cardType === 'video' || cardType === 'image'`. Pour `type=texte`, `attached_audio` est ignoré côté serveur.

3. **Et publier une musique SEULE est bloqué.** `GabaritEditor.tsx:182-186` et bouton `disabled` (565) exigent `mediaUrl || title || description`. Un `son` seul ne suffit pas (`hasContent` 112-114 le compte, mais `publish` 182 ne le compte pas). Donc : Music Card → `+` → son présélectionné → si l'user ne tape rien ni n'ajoute de média → bouton Publier grisé / erreur « Ajoute un média ou un texte ».

**Ce qui manque :** un type de card « son » (ou autoriser `attached_audio` sur `texte`/sur une card sans média), côté composer (envoyer `attached_audio` dans la branche texte) ET côté API (sérialiser `attached_audio` quel que soit le type) ET côté `publish` (accepter `son` comme contenu suffisant). Aujourd'hui le seul `attached_audio` survivant exige un média porteur.

> Note : `lib/db/direct_cards.ts:55` (le doublon mort) ne sait même pas écrire `attached_audio_json` — si un refactor réimporte ce doublon par erreur, l'audio sautera silencieusement partout.

---

## 5. BUG « recherche n'affiche que l'image »

**Surface concernée :** `app/decouvrir/page.tsx` (la recherche/découverte in-app).

**Causes exactes :**

1. **Rendu = miniature nue.** `app/decouvrir/page.tsx:100-112` : la grille ne rend que `<video>`/`<img>` + un compteur de vues. Aucun titre, aucune description, aucun hashtag. Elle n'utilise NI `PostText`, NI `parseCaption`. → « ne montre que l'image ».

2. **Les cards sans média sont exclues.** `app/decouvrir/page.tsx:37` : `.filter((it) => it.media_url && it.kind !== 'boutique')`. Toute `texte_card` (pas de `media_url`) est jetée → invisible en recherche.

3. **La recherche est un simple `includes` client sur `caption`.** `app/decouvrir/page.tsx:67-68` : `items.filter(it => (it.caption||'').includes(ql))`. Elle n'utilise PAS `searchCards` (FTS5, `lib/db.ts:5845`) ni le `text` des cards texte ni les `metadata_map`. Résultats partiels et titre/snippet jamais affichés.

> Il existe une vraie recherche FTS5 (`searchCards` `lib/db.ts:5845`, table `card_search`, retourne `title`/`snippet`) mais elle n'est câblée QUE sur l'outil IA T2M Officiel (`lib/ai/officiel/tools.ts`), **aucune route HTTP**, donc l'UI Découvrir ne peut pas l'utiliser.

---

## 5bis. BUG bonus confirmé : « porte 3D qui n'apparaît pas »

`components/feed/PostShell.tsx:47` : `const isPiece = piece3dOn && item.kind === 'image_card' && caption.includes('[PIECE3D]')`.
`piece3dOn = useFeature('piece3d')` (45) et le **défaut du flag est `0`/off** (`lib/app-settings.ts:56` `{ piece3d: '0' }`, `lib/client/use-feature.ts:19` fallback `false`). → Tant que l'admin n'active pas la feature, la porte 3D n'est jamais rendue, même si la card `[PIECE3D]` existe.

---

## 6. PLAN D'UNIFICATION PROPOSÉ

### Racine cible
- **1 modèle de données canonique** : finir `unified_posts` (déjà écrit, jamais lu). Colonnes déjà prévues : `post_type` (`chat|image|video|texte|son|vitrine|piece3d|annonce`), `media_url`, `caption/text`, `attached_audio_json`, `attached_product_json`, markers → colonne `post_type` au lieu de strings dans la caption. Brancher le feed dessus (`getMixedFeed` → `SELECT … FROM unified_posts`).
- **1 fonction de création** : `createPost(input: CanonicalPostInput)` qui couvre tous les types (média optionnel, audio optionnel, produit optionnel, post_type explicite). Tout le reste l'appelle ; supprimer le doublon `lib/db/direct_cards.ts:createDirectCard`.
- **1 parseur** : `lib/posts/parse-caption.ts` (déjà écrit) + strip markers intégré → utilisé partout. **1 composant d'affichage** : un `PostView` unique qui consomme le modèle canonique + `PostTitle/PostMeta`.

### Migrations ordonnées (du moins risqué au plus structurant)

| # | Migration | Effort | Risque régression | Pourquoi cet ordre |
|---|---|---|---|---|
| 1 | **Unifier le parseur** : ImageCardDisplay / VideoCardDisplay / TexteCardDisplay / `app/piece/page.tsx` importent `parseCaption` de `lib/posts/parse-caption.ts` (y intégrer le strip `[MARKER]` + support `@tags`). | S | Faible (rendu only) | Gain immédiat, zéro DB, supprime 3 dups. |
| 2 | **Fix bug recherche** : Découvrir affiche titre via `parseCaption` + inclut les `texte_card` (retirer le filtre `media_url`, rendre un fond couleur pour texte) + brancher une route `/api/search/cards` sur `searchCards`. | S/M | Faible | Visible utilisateur, isolé à `decouvrir` + 1 route. |
| 3 | **Fix bug music→post** : (a) composer envoie `attached_audio` aussi en branche texte ; (b) API sérialise `attached_audio` quel que soit le type ; (c) `publish` accepte `son` seul comme contenu ; idéalement (d) `post_type='son'` + rendu disc. | S/M | Moyen (touche create route partagée) | Débloque un usage cassé sans changer le schéma. |
| 4 | **Supprimer le doublon `createDirectCard`** de `lib/db/direct_cards.ts` (réexporter celui de `lib/db.ts`). | S | Faible | Élimine le piège « audio largué ». |
| 5 | **Router `ensureRoomPost` (3D) + vitrines via `createDirectCard`** au lieu d'INSERT brut, pour récupérer indexation + mirror automatiques. | M | Moyen | Rapatrie 2 chemins divergents sur la racine d'écriture. |
| 6 | **Markers → `post_type` colonne** (arrêter d'encoder `[PIECE3D]`/`[VITRINE:…]` dans la caption ; migrer + lire la colonne). | M/L | Moyen | Supprime le couplage par string ; PostShell lit `post_type`. |
| 7 | **Brancher le feed sur `unified_posts`** (lecture) + retirer `getMixedFeed`/double-write. | L | Élevé | Le vrai « 1 modèle » ; à faire en dernier, derrière feature flag, après backfill validé. |
| 8 | **Composant `PostView` unique** consommant le modèle canonique (fusionne les 4 *CardDisplay + overlays PostShell). | L | Élevé | Convergence finale du rendu. |
| 9 | **(Option) Annonces → post_type='annonce'** dans la racine, ou laisser `deposit_annonces` comme source mais miroir vers `unified_posts` pour recherche/feed. | M/L | Moyen | Décision produit : faut-il que les annonces vivent dans le feed unifié ? |

### Garde-fous prod (app bientôt en prod)
- Étapes 1–4 livrables tout de suite (faible risque, corrigent les 3 bugs cités).
- Étapes 5–9 derrière un feature flag, avec backfill `backfillUnifiedPosts()` (`lib/db.ts:3829`) validé en staging avant de basculer la lecture (7).
- Ne JAMAIS activer 7 sans avoir vérifié l'égalité ligne-à-ligne `getMixedFeed` vs `SELECT unified_posts` (recoupement compteurs, doctrine « compteurs = capteur »).

---

### Annexe — preuves clés
- Racine parseur ignorée : aucun import de `lib/posts/parse-caption.ts` (grep 0 résultat).
- 3 dups : `ImageCardDisplay.tsx:65`, `VideoCardDisplay.tsx:115`, `TexteCardDisplay.tsx:87`.
- `unified_posts` jamais lu : seuls writes/backfill (`lib/db.ts:3795-3837`), feed lit `getMixedFeed` (`app/api/posts/route.ts:242`).
- 2× `createDirectCard` : `lib/db/direct_cards.ts:55` (sans audio) & `lib/db.ts:3839`.
- Audio gaté média : `app/api/cards/create/route.ts:72-73` + `GabaritEditor.tsx:201-208`.
- Recherche image-only : `app/decouvrir/page.tsx:37,67-68,100-112`.
- Porte 3D gatée : `PostShell.tsx:47` + `app-settings.ts:56` (défaut off).
