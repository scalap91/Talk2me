# Moteur `.card` v2 — LE LECTEUR UNIQUE (référence)

> **But** : une SuperCard `.card` = source de vérité unique ; **UN seul lecteur** l'interprète
> par CONTEXTE et sort un `CardView` (ViewModel déclaratif) que l'UI peint. Pas de `switch(type)`,
> pas de renderer parallèle. Ce dossier est la **RÉFÉRENCE** ; le portage Flutter doit reproduire
> ce comportement **à l'identique** (web = référence, natif = miroir).

## Pipeline (l'ordre)

```
.card (spec:1 legacy)  --convert-->  SuperCardV2 (spec:2)  --renderCard(card, context)-->  CardView  -->  UI peint
        registry (source unique des noms/champs)   validate (garde)      services (argent/dispo/permissions)
```

| Fichier | Rôle |
|---|---|
| `types.ts` | `SuperCardV2` = 4 strates (socle · référencé · calculé · overlay). Enums, sous-types. |
| `registry.ts` | **source unique** : KINDS, FACETS, contextes, champs autorisés (jeu fermé), types de champs de blocs. |
| `validate.ts` | `validateCard(input)` — validation **récursive** (valeurs comprises), rejette argent/PII égarés, spec:1. |
| `convert.ts` | `convertV1toV2(v1)` — spec:1 → spec:2, dé-duplication, cycles par chemin. |
| `reader/reader.ts` | **`renderCard(card, context, overlay, services)` → `CardView`** — LE lecteur unique. |
| `reader/services.ts` | services partagés : `deriveBadge`, `displayMoney` (MGA→« Ar »), dispo, permissions. |
| `reader/seo.ts` | contexte SEO → `SeoMeta` (bascule #1). |
| `reader/feed.ts` | dénormalisation feed via le lecteur (bascule #2). |
| `compare/compare.ts` | comparateur legacy vs v2 (validation avant branchement). |

## Contextes (liste OUVERTE — L8)
`feed · chat · search · seo · full · preview · purchase · checkout · live · escrow · library`.
Chaque contexte = une **stratégie** (média cover|all, corps none|excerpt|full, actions primary|all, enfants),
PAS un lecteur séparé. Ajouter un contexte = ajouter une stratégie, jamais modifier la carte.

## Règles NON négociables (à respecter dans le port Flutter)
- **P3 — argent** : une seule représentation, **MGA entier**, **revalidé SERVEUR**. Le lecteur AFFICHE un prix
  formaté (« Ar »), il ne calcule JAMAIS un total à débiter (`displayMoney.payableTotal` throw côté client).
- **P10 — PII air-gap** : owner/payee = **id opaque**, jamais de PII dans la carte.
- **P5 — présentation déclarée** : badge/labels/actions sont LUS, jamais réinventés.
- **P9 — un seul lecteur** : même carte + même contexte ⇒ même `CardView` partout (web ET natif).
- **Enfant ≠ overlay parent** : un enfant inline reçoit un overlay VIDE (distance/total sont propres à la racine).

## Bascules en place (dev, derrière flags, legacy intact si OFF)
- **`SUPERCARD_SEO_V2`** — `generateMetadata` de `/card/[id]` via `renderSeo` (mapper og:type Next-safe :
  product/restaurant → website). Comparateur : 0 régression (money MGA→Ar, description assemblée depuis `specs`).
- **`SUPERCARD_FEED_V2`** — hints d'item de feed (type/kind/média/légende) via `renderCard(card,'feed')`.
  Comparateur : **24/24 identiques**. Garde-fou : toute erreur v2 → legacy (le feed ne casse jamais).

## Reste à porter sur le web (surfaces)
- **Recherche** : (i) index FTS = **projection calculée** de la carte (remplacer `lib/search/metadata-map.ts`
  qui lit `UnifiedCard`) ; (ii) rendu des résultats en contexte `search`. Comparaison = **jeu de résultats**.
- **Corps de la page `/card`** (contexte `full`) et **feed niveau 2** : faire consommer le `CardView`
  au composant de rendu (`AlignedPostCard`) au lieu de re-parser le `.card`.
- **Écriture** : brancher `validateCard` dans `writeCardFile` (garde argent/PII) — **en dernier** (sensible).

## Guide de PORTAGE Flutter (Dart)
Le natif doit exposer l'équivalent Dart de `renderCard(card, context) -> CardView`, alimenté par le `.card`
(comme `card_reader.dart` aujourd'hui, mais aligné sur CE contrat). Points de vigilance identiques :
argent en Ariary entier + total serveur, badge dérivé une fois, média cover vs galerie selon contexte,
excerpt emoji-safe (par point de code), enfants sans overlay parent. Tout écart de comportement = bug de port.

*Doctrine : [[project_talk2me_supercard_refonte]] · [[feedback_card_est_la_source]] · [[reference_talk2me_alignedpostcard_blueprint]]*
