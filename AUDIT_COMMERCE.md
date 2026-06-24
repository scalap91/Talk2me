# Audit couche COMMERCE Talk2Me — 2026-06-23

But : sortir de l'incohérence (plusieurs vitrines, 2 systèmes d'annonces, € vs Ariary)
et unifier. Cartographie complète ci-dessous, puis plan d'unification priorisé.

## A. Vitrines / vues produit (chacune avec un comportement d'achat DIFFÉRENT)
| Vue | Ouverte depuis | Achat |
|---|---|---|
| BoutiqueVitrine (`/boutique/[id]`) | lien public | panier « + » |
| BoutiqueSheet (`components/feed`) | annonce→Voir la boutique, Eat | panier→escrow (eat) / **Acheter protégé** (boutique, ajouté 2026-06-23) |
| boutique3d (`/boutique3d`) | porte 3D feed (VitrineCard) | panier 3D |
| ma-boutique (`/ma-boutique/[id]`) | ma boutique | édition (normal) |
| SheinStore + ProductDetailSheet | onglet Shop (dropship CJ) | lien externe affilié (pas d'escrow) |
| ShopStore | (pas monté) | rien |
| AnnonceDetailSheet | feed Annonces | Contacter + **Acheter protégé** |

## B. Chemins d'achat (3 disjoints)
- **`/api/commerce/buy`** = achat protégé unifié (escrow ou MVola) — le BON, récent.
- **`/api/wallet/escrow`** = lock direct (utilisé par BoutiqueSheet eat, commission 10% **codée en dur** `BoutiqueSheet.tsx:69`).
- **Chat manuel** : `/api/boutique/order`, `/api/simple-shop/contact`, `/api/annonces/contact` (aucun paiement).

## C. Données (4 bases, doublons)
- boutiques.db / plats.db / eat.db (shops+items, pas de JOIN inter-base) — items portent `annonce_on`.
- annonces.db `deposit_annonces` (annonces autonomes).
- shop.db `shop_products` (dropship CJ, isolé, jamais d'escrow).
- talktome.db : wallet_transactions, escrows, payment_intents, payouts (multi-devise `currency`).

## D. Devise (le gros morceau)
- Serveur : tout en `cents` + colonne `currency` (MGA marché / EUR legacy). OK.
- **UI : € codé en dur dans ~14 fichiers** : BoutiqueSheet, VitrineCard, boutique3d, BoutiqueCart, TransportFeed, StatusBar, drafts, AnnonceDetailSheet, AnnoncesFeed… Seuls wallet/page + cm-assist sont en Ar.
- Prix saisis : `Number(price)*100` (convention centimes) — faux pour MGA (sans sous-unité).

## E. Incohérences majeures
1. Plusieurs vitrines au comportement d'achat divergent (cf. A).
2. Deux systèmes d'annonces (deposit_annonces vs items.annonce_on) — pontés au feed le 2026-06-23, mais 2 CRUD.
3. Commission 10% codée en dur (BoutiqueSheet), pas de config.
4. Devise : UI majoritairement € alors que marché = MGA.
5. 3 chemins de paiement non unifiés.
6. dropship (shop_products) hors escrow.

## PLAN D'UNIFICATION (bricques, à valider par Pascal)
1. **DEVISE** : helper unique `formatMoney(cents, currency)` (MGA sans centimes) → remplacer tous les `€` en dur ; saisie prix sans ×100 pour MGA. = cohérence visuelle immédiate.
2. **ACHAT UNIQUE** : `/api/commerce/buy` partout ; « Acheter » protégé sur toute vitrine ; « Contacter » en secondaire ; retirer le double chemin escrow direct + commission en dur → commission centralisée (config).
3. **VITRINE UNIQUE** : choisir UNE vue (BoutiqueSheet recommandé) ; rediriger/supprimer les autres (BoutiqueVitrine, ShopStore mort).
4. **ANNONCES UNIQUES** : finir la fusion (source = item.annonce_on + deposit_annonces sans boutique), un seul CRUD.
5. **DROPSHIP** : décider — escrow comme le reste, ou rester affilié externe (assumé).
