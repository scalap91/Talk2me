# Annonces — REFONTE PROPRE (Pascal 2026-06-23)

Objectif : UN module annonces cohérent, inspiré de la structure nette de SixMarket
(1 modèle, 1 liste, 1 détail, 1 form), branché sur l'existant T2M (wallet/escrow/chat).
On NE greffe PAS d'appli étrangère. On NE duplique pas. Devise = Ariary (money.ts).

## 1. Modèle de données — UN seul concept : « listing »
Problème actuel : 2 sources (deposit_annonces + boutique_items.annonce_on) = incohérence.
Décision : **garder les 2 origines mais les exposer via UN type unique** `Listing` (vue lecture),
déjà amorcé (getPublishedAnnonces agrège). On formalise :

```
Listing {
  id, source: 'deposit' | 'shop_item',
  title, description, price_cents (Ariary), category, city, image_url,
  owner_id, seller_label, shop_key?, shop_name?, created_at, status
}
```
- `deposit` → éditable via le formulaire annonce.
- `shop_item` → éditable dans la boutique (article).
- Achat : même `/api/commerce/buy` (déjà gère les 2).

## 2. Les 3 écrans (cohérents, même charte)
- **Liste** (`AnnoncesFeed`) : bouton « Ajouter une annonce » + « Mes annonces (N) » repliable ;
  catalogue par catégorie ; tuile = image + prix (Ar) + titre + extrait description.
- **Détail** (`AnnonceDetailSheet`) : image, titre, prix, description, ville, vendeur.
  Actions : **Acheter** (toujours) ; si à moi → **Modifier** ; sinon → **Contacter** ; + Voir la boutique.
- **Form** (`DepositAnnonceSheet`) : plein écran « ← Modifier/Nouvelle annonce », champs photo/cat/titre/desc/prix(Ar)/ville/géoloc, Brouillon/Publier.

## 3. Règles (la rigueur, fini les incohérences)
- Devise : TOUJOURS `formatMoney`/`toMinor` (Ariary, pas de ×100, pas de €).
- Retour : TOUJOURS `goBack()` (jamais une route codée en dur).
- Owner-aware : jamais « Contacter » sur sa propre annonce ; « Modifier » à la place.
- 1 helper d'erreur réseau commun (alerte claire, jamais d'échec muet).
- Pas de page neuve dupliquée : on édite les 3 fichiers existants.

## 4. État (après v575-v579, déjà fait)
- ✅ Form plein écran + Ariary (v575) · ✅ retour goBack (v577) · ✅ owner-aware + Acheter partout (v579)
- ✅ extrait description sur tuile · ✅ articles badgés éditables (→ boutique) · ✅ parse prix robuste + suppr. gérée

## 5. RESTE pour « propre » (à faire)
1. Formaliser le type `Listing` unique (lib) + que `/api/annonces` et `/api/annonces/mine` le renvoient tel quel (1 forme, plus de divergence deposit/shop_item côté client).
2. Charte visuelle commune aux 3 écrans (même radius, mêmes tailles de bouton, même header) — finir l'harmonisation.
3. Helper `netError()` partagé (remplace les alert() dispersés).
4. Vérifier le flux complet bout-en-bout : déposer → voir dans liste → ouvrir détail → acheter (autre compte) → escrow → modifier (mon compte).
