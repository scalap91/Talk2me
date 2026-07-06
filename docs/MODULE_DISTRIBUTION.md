# Module Distribution / Acheminement — Cadrage

> Statut : **CADRAGE** (rien de codé). Doctrine : [[project_talk2me_distribution_acheminement]].
> Ordre de mission. À valider par Pascal avant toute ligne de code. Module par module.

---

## 1. Le problème (le vrai)

Dans les marchés sous-équipés (ex. **Madagascar**) :
- La **capacité de transport existe déjà** : motos, voitures, partout. Ce ne sont PAS les véhicules qui manquent.
- Ce qui manque = la **couche d'organisation** : pas de commande structurée, pas de paiement sécurisé, pas d'acheminement coordonné.
- Les gens **vendent sur Facebook**, un outil jamais pensé pour vendre/livrer. Ils bricolent.
- Résultat : friction énorme, pas de confiance, le business mondial n'est pas acheminé correctement vers ces populations.

**Le manque réel = organisation + confiance + paiement. Pas le matériel.**

---

## 2. La thèse T2M

T2M devient le **point de passage physique** du Hub : on ne relie plus seulement l'info (contenu, contacts), on relie **vendeur → acheteur en marchandise qui arrive**.

**Principe non-négociable = ASSET-LIGHT.** On n'achète **aucun** véhicule, **aucun** entrepôt. On **orchestre l'existant** (même modèle qu'AirBizness). Les motos/voitures sont les **distributeurs** ; T2M est le **cerveau de coordination**.

---

## 3. Les 2 déblocages (sans eux, rien ne marche)

| # | Déblocage | Pourquoi | Contrainte dure |
|---|-----------|----------|-----------------|
| 1 | **Rail de paiement LOCAL = mobile money** (MVola, Orange Money, Airtel Money) | Pas de carte bancaire dans ces marchés. Stripe = inutile ici. | ⚠️ Tant que le rail n'est pas **réel + vérifié**, AUCUNE promesse de flux d'argent. |
| 2 | **Escrow (séquestre)** : l'acheteur paie → argent **bloqué** → libéré **à la livraison** | Débloque le commerce où personne ne se fait confiance en ligne. C'est LE produit. | Le Wallet doit tenir un état « bloqué / libéré / remboursé » incontestable. |

---

## 4. Les acteurs

- **Vendeur** : a une Boutique (déjà construite), crée des produits.
- **Acheteur** : découvre via le Hub / la Boutique, commande, paie en mobile money.
- **Chauffeur / livreur** (moto, voiture) : ressource informelle existante, accepte une course d'acheminement.
- **T2M** : orchestre la commande, séquestre l'argent, matche le livreur, libère le paiement à la livraison.

---

## 4 bis. STRATÉGIE D'ADOPTION — le wedge tuk-tuk (Pascal 2026-06-08)

**On ne peut pas ACHETER l'adoption** (bootstrap, jamais de levée [[project_bizzi_no_funding]]) → pas de pub payée. Le produit doit se **diffuser tout seul. Viral ou rien.**

**Le wedge = mise en relation tuk-tuk ↔ population, GRATUITE, cash à bord.** C'est l'hameçon **quotidien** (le transport est journalier ; le commerce, occasionnel) qui fait entrer **les deux côtés du marché** :
- les **chauffeurs** s'inscrivent (veulent des courses) → deviennent ensuite **la flotte qui livre les colis** ;
- la **population** s'inscrit (bouge tous les jours) → devient **les acheteurs** des boutiques.

**Boucle virale — le chauffeur EST le canal de distribution :** chaque course physique de tuk-tuk = un événement de diffusion. Le chauffeur dit « trouve-en un en 2 min avec ça, gratuit » → le passager installe **par son numéro** (zéro email). La flotte qui roule déjà dans la rue = le canal marketing, gratuit, quotidien.

**3 règles dures :**
1. **Densité AVANT largeur.** Saturer **UNE zone** jusqu'à « tuk-tuk en < 3 min » → la zone adopte en bloc → copier-coller sur la suivante. Jamais étalé fin (leçon AirBizness).
2. **Sol de friction bas.** App minuscule, Android bas de gamme, mauvaise data, install **par le numéro**. Aussi simple que WhatsApp. Contrainte d'ingénierie dès le jour 1.
3. **Gratuit + quotidien = l'habitude.** Le réflexe quotidien (transport) fait qu'au moment d'acheter/vendre, l'user est **déjà là**.

**Anti-éparpillement :** l'adoption massive ne vient PAS de plus de features, mais d'**UNE utilité quotidienne gratuite, faite magiquement, qui se distribue elle-même.**

**Trajectoire « gratuit » (à trancher, ne change pas le code V1) :** gratuit pour la population toujours (mission), et c'est le **commerce/boutiques** qui font vivre le tout ? OU gratuit comme acquisition + micro-contribution chauffeur un jour ? V1 = gratuit + cash à bord dans tous les cas.

**Zone pilote :** _à fixer_ (un quartier précis d'une ville, PAS « le pays »).

---

## 5. Brique 1 (première testable) — **Mise en relation tuk-tuk ↔ population** (gratuite, cash à bord)

> Réordonnancé (Pascal 2026-06-08) : le tuk-tuk passe AVANT l'escrow/colis. Pourquoi : **aucun blocage paiement** (cash à bord → pas d'escrow, pas de mobile money), meilleure acquisition (hameçon quotidien viral), et ça pose **le moteur de matching** qui resservira aux colis ET aux services. Même moteur, on commence par transporter des **gens** au lieu de **colis**.

**Périmètre V1 :** géoloc + matching (course → tuk-tuk le plus proche) + couche Comm Call/SMS (déjà construite) pour se coordonner. T2M = **pur connecteur** : on relie, on ne transporte pas, on n'est pas responsable de la course (communication ≠ responsabilité). Asset-light total.

### Machine à états de la Course
```
demandée ──match──▶ acceptée ──▶ en_route ──▶ à_bord ──▶ terminée
   │                   │
   └──annulée          └──refusée/expirée ──▶ re-match
```
Paiement = **cash à bord**, hors-app (comme aujourd'hui). Aucun flux d'argent dans T2M en V1.

### Schéma DB (esquisse — lib/db.ts, à valider)
```
rides(
  id, rider_id, driver_id NULL,
  pickup_lat, pickup_lng, dropoff_lat NULL, dropoff_lng NULL,
  status,                       -- machine à états ci-dessus
  created_at, updated_at
)
ride_events(                    -- append-only
  id, ride_id, from_status, to_status, actor_id, meta, created_at
)
drivers(                        -- profil chauffeur (réutilise users)
  user_id, vehicle_type,        -- tuk-tuk / moto / voiture
  is_online, last_lat, last_lng, last_seen_at
)
```

### Hors-scope brique 1 (volontairement)
- Tout paiement in-app (cash à bord). Escrow → brique 2.
- Notation/réputation chauffeur, tarif estimé, historique riche → plus tard.

---

## 5 bis. Brique 2 — Objet **Commande** + **Escrow Wallet** (transport de COLIS)

C'est le **cœur de confiance** pour le commerce de biens. On réutilise le moteur de matching de la Brique 1 (le tuk-tuk devient le livreur). On le fait AVANT le rail mobile money réel (simulé en sandbox d'abord).

### Machine à états de la Commande
```
créée ──paiement──▶ payée_escrow ──assignée──▶ en_livraison ──confirmée_recue──▶ livrée ──▶ libérée
   │                     │                                                            
   └──annulée            └──litige / non_livrée ──▶ remboursée
```

### Règle d'or de l'escrow
- À `payée_escrow` : le montant quitte le Wallet acheteur → **bloqué** (ni vendeur ni T2M ne peuvent y toucher).
- Libération vers le vendeur **uniquement** sur **confirmation de réception** (acheteur) — ou règle de délai/litige à définir.
- Remboursement acheteur si `non_livrée` / `litige` tranché.
- **Chaque transition = trace immuable** (ledger append-only, jamais un simple UPDATE qui écrase).

### Schéma DB (esquisse — lib/db.ts, à valider)
```
orders(
  id, buyer_id, seller_id, boutique_id, product_id,
  amount, currency, status,           -- status = machine à états ci-dessus
  delivery_pin_lat, delivery_pin_lng, -- adressage sans rue (épingle géoloc)
  driver_id NULL,                     -- brique 2
  created_at, updated_at
)
order_events(                         -- ledger append-only, jamais d'écrasement
  id, order_id, from_status, to_status, actor_id, meta, created_at
)
escrow_holds(
  id, order_id, buyer_id, amount, currency,
  state,                              -- held | released | refunded
  created_at, released_at NULL
)
```

### Hors-scope brique 1 (volontairement)
- Matching livreur réel → brique 2.
- Rail mobile money réel → brique 3 (sandbox/simulation d'abord).
- Tarification dynamique, multi-produits par commande, notation livreur → plus tard.

---

## 6. Briques suivantes (ordre indicatif, à re-valider à chaque fois)

- **Brique 3 — Rail mobile money réel** : intégration MVola / Orange Money / Airtel Money. ⚠️ vérifier le rail AVANT toute promesse.
- **Brique 4 — Boutiques de SERVICE** : prestation (coiffeur, plombier, cours…) sur le même cœur escrow. Saveur « Réservation » au lieu de « Commande ». Prix fixe d'abord, devis ensuite.
- **Brique 5 — Adressage sans rue** : épingle géoloc + coordination vocale/SMS (les adresses postales n'existent pas).

---

## 7. Rayon d'impact (ce que ça touche)

**Appelle / réutilise :** Boutique (catalogue), Wallet (escrow), couche Comm Call/SMS (coordination), géoloc, le pont public→privé.
**Nouveau :** tables `orders` / `order_events` / `escrow_holds`, machine à états, API commande, UI commande côté acheteur + vendeur + (plus tard) livreur.
**Ne touche pas :** la couche sociale (amis/chat/IA L2), le contenu. La distribution est une couche **transactionnelle** distincte, branchée sur le Hub.

---

## 8. Garde-fous

- **Asset-light absolu** : jamais de flotte/entrepôt en propre.
- **Pas de promesse d'argent** tant que le rail mobile money n'est pas réel et vérifié.
- **Contenu grounded** : pas de produit/prix inventé ; on n'indexe pas une boutique vide.
- **PII air-gap** : numéro/identité ne fuitent jamais dans les tuyaux IA.
- **Module par module** : on cadre, on valide, on code une brique, on teste, puis la suivante. Pas de scotch éparpillé.

---

## 9. Décision attendue de Pascal

1. ✅/❌ le cadrage global + l'ordre des briques (tuk-tuk en Brique 1).
2. On démarre bien par **Brique 1 (mise en relation tuk-tuk ↔ population, gratuite, cash à bord)** — géoloc + matching + Call/SMS, zéro paiement ?
3. **Zone pilote** : quel quartier / ville précis pour saturer en premier (densité avant largeur) ?
4. Trajectoire « gratuit » long terme : commerce subventionne / micro-contribution chauffeur plus tard ?

---

## 10. ACHEMINEMENT RELAIS — track & trace multi-segments (Pascal 2026-06-22)

> Vision Pascal → mise en système pro (standards logistiques mondiaux adaptés Mada).
> Statut : **CADRAGE validé sur le principe**. Code module par module à partir de la Brique A.

### Modèle
- **Bon de transport + n° de tracking** (waybill) : créé à la commande d'une annonce. Porte origine, destination, segments, détenteur courant, statut.
- **Suivi par ÉVÉNEMENTS** (append-only, inviolable) : `créé, pris_en_charge, parti, position(gps), arrivé_segment, remis, livré, exception(...)`. L'itinéraire = la suite d'événements ; jamais d'UPDATE qui écrase.
- **Routage multi-segments** : ligne principale (inter-ville) + dernier km. 1 segment = 1 porteur.
- **Remise par code "4 derniers chiffres du téléphone"** (POD/OTP façon Yango) à chaque retrait / inter-segment / livraison finale. Identité = numéro (inscription par tél).
- **Chaîne de garde (custody)** : 1 seul détenteur à tout instant, **toujours une personne, jamais un lieu** (Mada = main-à-main, ZÉRO point relais/dépôt).
- **ETA + détection d'arrêt** : porteur déclare durée + appuie "le colis part" → ETA. GPS immobile > seuil → exception "à l'arrêt" → ping auto porteur (panne/pause/RAS) → escalade. WATCHDOG ([[feedback_watchdog_pipeline]]).
- **Gestion d'exceptions** : maillon absent / panne / retard / client absent → re-diffusion du segment (re-match à la position GPS), escalade vendeur, notif. Le colis ne quitte jamais une main identifiée.
- **Contacts cloisonnés** : voisins seulement (N ↔ N-1, N+1). Client ↔ dernier maillon (joignable à tout moment). **Vendeur = oversight** : voit tout l'itinéraire + peut joindre le maillon bloqué quand ça casse. Tout masqué via la couche Comm (PII air-gap).
- **Règlement à la livraison** (COD + escrow) : payé à la commande → bloqué → **split multi-parties** (vendeur+A+B+C) libéré à la preuve de livraison, filet 24-48h sans litige. Mobile money (Orange Money) → **dépend du rail réel**.

### Spécificités Mada (bakées)
Identité par téléphone (zéro email) · géo-épingle sans rue + coordination vocale · porteurs informels opportunistes (trajets déclarés + diffusion) · low-data (pings espacés + fallback SMS) · CNI obligatoire (confiance/traçabilité) · pas d'infrastructure (main-à-main).

### Ordre des briques
- **A — Porteur + CNI + inscription téléphone** (le gate, prérequis de tout).
- **B — Shipment multi-segments : bon de transport, trajets déclarés, matching A→B, handover 4-chiffres, événements + tracking GPS, custody.**
- **C — Watchdog (détection arrêt/ETA) + exceptions (re-match, escalade vendeur) + contacts cloisonnés.**
- **D — Règlement à la livraison (escrow multi-parties) quand le rail Orange Money est réel.**

### Garde-fous spécifiques
- Colis scellé : porteur ignore le contenu MAIS CNI vérifiée + vendeur déclare catégorie + charte produits interdits + responsabilité vendeur/acheteur (anti-mule).
- Pas de promesse d'argent avant rail mobile money réel.
- Un colis bloqué doit aboyer (watchdog), jamais d'échec silencieux.
