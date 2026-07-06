# Audit Talk2Me — Lancement réel Madagascar (vendre → encaisser → livrer)

Auditeur : revue technique sans complaisance. Date : 2026-06-22.
Périmètre : chemin critique uniquement (vendre / encaisser / livrer / onboarding). Modules DJ, music-hub, watch-together, jeux, AI-video, avatar 3D = largeur produit, **hors chemin critique** (non audités en profondeur).

---

## Verdict en 3 lignes

1. **NON lançable en l'état pour la promesse "vendre → encaisser → livrer avec de l'argent réel".** Tout le volet ARGENT est **SIMULÉ** : escrow, wallet, split à la livraison, payout — aucun centime réel ne bouge. Les adaptateurs mobile money existent mais sont **inertes (aucune clé, encaissement non testé, versement/payout pas codé du tout)**.
2. **LE bloqueur n°1 = le rail mobile money n'existe pas en pratique** : (a) cash-in MVola codé mais jamais branché/testé, Orange + Airtel = scaffolds avec `TODO` dans les appels HTTP ; (b) **le payout vendeur n'est implémenté pour AUCUN opérateur** (`requestPayout` refuse tout sauf sandbox). Sans payout réel, un vendeur ne touche jamais son argent → la promesse est mensongère.
3. **Bloqueur n°2 (notre code, rapide) = onboarding cassé sur 2 fronts** : l'inscription/connexion est **email magic-link uniquement, AUCUN OTP/SMS par téléphone** (contraire à la doctrine "identité = numéro"), ET le **formulaire KYC porteur ne rend pas les champs nom / vidéo / attestation SIM** que le back-end exige → un nouveau porteur ne peut JAMAIS se faire vérifier.

---

## Tableau par brique

| Brique | État | Preuve (fichier:ligne) | Ce qui manque pour "fini" |
|---|---|---|---|
| **Escrow (verrou de transaction)** | 🟡 logique solide mais **SIMULÉ** | `lib/escrow.ts:11` (`MODE TEST : argent fictif`), `:78` débit wallet interne, `:103` crédit wallet interne | Argent réel. Tout repose sur `wallet_transactions` (monnaie fictive). Aucune connexion à un rail. |
| **Wallet (solde interne)** | 🟡 fonctionnel mais argent fictif + **trou d'intégrité** | `app/api/wallet/topup-test/route.ts:18` crédite **+10 € gratuits** à tout user connecté, sans paiement | Supprimer `topup-test` avant tout rail réel (sinon impression illimitée de monnaie). |
| **Cash-in MVola** | ⏳ codé, **inerte (attend clés)**, jamais testé live | `lib/payments/mvola.ts:6` ("PRÊT À BRANCHER : il ne manque que les clés"), `:43` `mvolaConfigured()` → false sans env | Clés `MVOLA_CONSUMER_KEY/SECRET/MERCHANT_MSISDN` (Pascal) + test sandbox réel. Champs/devise "à confirmer" (`:25`, `:92`). |
| **Cash-in Orange Money** | 🔴 **scaffold, appels HTTP en `TODO`** | `lib/payments/orange-money.ts:7` ("SCAFFOLD : appels HTTP en TODO"), `:76` `TODO(au branchement)` | Onboarding marchand Orange (pas tenté côté Pascal) + finir/valider les appels + clés. |
| **Cash-in Airtel Money** | 🔴 **scaffold, `TODO` dans l'appel** | `lib/payments/airtel-money.ts:6` ("SCAFFOLD"), `:75` `TODO(au branchement)` | Idem Orange : onboarding + finition + clés. |
| **Webhook paiement (crédit wallet)** | 🔴 **pas de vérification de signature** | `app/api/payments/mvola/callback/route.ts:16-37` : POST JSON → `markIntentPaid` sans HMAC/signature/IP allowlist | Vérifier l'authenticité MVola (signature/secret partagé). Sinon, une fois live, **n'importe qui peut forger un "completed" et créditer un wallet**. |
| **Payout vendeur (cash-out / disbursement)** | 🔴 **NON implémenté** (sauf sandbox) | `lib/payments.ts:169-198` : `requestPayout` refuse tout sauf `provider==='sandbox'` (`:177-180`), sandbox marque `'paid'` sans rien envoyer (`:190`) | Le disbursement est une API distincte de l'encaissement, **pas câblée pour MVola/Orange/Airtel**. C'est le cœur de la promesse "le vendeur encaisse". |
| **Routeur opérateurs (détection préfixe)** | ✅ solide | `lib/payments/operators.ts:51-65` normalisation + `detectOperator` (034/038→mvola, 032/037→orange, 033→airtel) | RAS (mais inutile tant que les adaptateurs sont inertes). |
| **Acheminement — moteur shipment** | ✅ solide et cohérent (logique) | `lib/shipment.ts` : trajets `:123`, shipment `:146`, relais main-à-main `:241`, pickup 4-chiffres `:266`, GPS `:293`, livraison `:351`, watchdog Telegram `:425-460`, démo bout-en-bout `:536` | Code mûr. Manque le branchement paiement réel (`releasePaymentSim` `:364-378` = **SIMULÉ**). |
| **Acheminement — paiement à la livraison** | 🔴 **SIMULÉ** | `lib/shipment.ts:159` (`escrow SIMULÉ`), `:360` `releasePaymentSim`, `:377` push "Paiement libéré (simulé)" | Brancher escrow réel au lieu de `releasePaymentSim`. Aucun lien actuel entre shipment et `lib/escrow`/`lib/payments`. |
| **KYC porteur — back-end** | ✅ solide (chiffrement CNI, vidéo, SIM) | `lib/transport-profile.ts:36-41` (colonnes full_name/cni_video/sim_attested), `:92-108` `submitCarrierProfile` exige tout, CNI chiffrée `:106` | RAS côté modèle. |
| **KYC porteur — formulaire UI** | 🔴 **CASSÉ : champs requis non rendus** | `app/devenir-transporteur/page.tsx:56-61` valide fullName/videoId/sim, mais le JSX `none/rejected` (`:104-148`) ne rend QUE phone, CNI n°, recto/verso, modes. **Aucun `<input>` lié à `setFullName`, aucun bouton `videoRef`, aucune case `setSim`** | Un nouveau porteur reste bloqué sur "Nom complet requis" → **personne ne peut devenir porteur**. Ajouter les 3 champs manquants au rendu. |
| **Vendre — annonces (dépôt)** | ✅ fonctionnel, données réelles | `lib/annonces-deposit.ts:3-8` (formulaire imposé, grounding), SQLite dédiée | RAS pour le MVP de dépôt. |
| **Vendre — boutiques perso / eat / plat** | ✅ fonctionnel (3 bases séparées) | `lib/simple-shop.ts:1-25`, `lib/commerce-dbs.ts` | RAS. Paiement = wallet fictif (voir escrow). |
| **Vendre — dropshipping CJ (#429)** | ⏳ codé, attend clé externe | `lib/cj-dropshipping.ts:26-35` `creds()` lève si pas de `CJ_DROPSHIPPING_EMAIL/API_KEY` | Clé CJ (Pascal). Hors marché Mada immédiat (dropship France d'abord). |
| **Composer (création post/card)** | ✅ fiable | `app/creer/texte/page.tsx`, `components/composer/ComposerProjectEditor.tsx` (pas de TODO bloquant ; les "placeholder" sont des hints d'input) | RAS. Voix `edge-tts` = module AI-video **hors chemin critique**, binaire non installé (`lib/ai-video/tts-edge.ts:6` venv `/home/ubuntu/tts-venv`). |
| **Onboarding par téléphone (OTP/SMS)** | 🔴 **ABSENT** | `app/signin/page.tsx:158-169` champ **email** uniquement ; routes auth = `magic-link` (email) seules ; aucune route OTP/SMS ; `lib/db.ts:824` `phone` = colonne optionnelle (jointure répertoire), pas une clé d'auth | Tout l'auth est email magic-link. Doctrine = identité par numéro. À Mada beaucoup d'users n'ont pas d'email. **Manque : login/signup par n° + OTP SMS.** |
| **Mailer (envoi magic-link)** | 🟡 dépend de clé Brevo | `lib/mailer.ts:5-7` : sans `BREVO_API_KEY` → pas d'envoi, lien affiché à l'écran (mode dev) | Clé Brevo (Pascal) pour envoyer réellement. En l'état, en prod sans clé, le lien magique s'affiche en clair côté client. |

Légende : ✅ solide · 🟡 à moitié · 🔴 cassé/absent · ⏳ attend clé externe.

---

## Chemin critique priorisé (ordre pour lancer)

| # | Action | Effort | Dépend de | Pourquoi |
|---|---|---|---|---|
| 1 | **Réparer le formulaire KYC porteur** : rendre les inputs nom complet, bouton vidéo liveness (`videoRef`), case attestation SIM dans `app/devenir-transporteur/page.tsx` | **S** | Nous (code) | Sans ça, zéro porteur vérifié → zéro livraison. Bug pur, le back est prêt. |
| 2 | **Onboarding/login par numéro + OTP SMS** (route request-otp / verify-otp, écran signin n°, lien session) | **M** | Nous (code) + Pascal (compte SMS Twilio/opérateur) | Identité réelle du marché. Tant que c'est email-only, l'utilisateur-cible ne peut pas entrer. |
| 3 | **Brancher + tester cash-in MVola en sandbox réel** (poser clés, valider token + initiateMerchantPay + callback, confirmer devise Ariary vs unité wallet) | **M** | Pascal (clés MVola) + Nous (test/normalisation) | Premier maillon argent réel. Code prêt mais jamais exécuté contre l'API. |
| 4 | **Sécuriser le webhook MVola** : vérif signature/secret + idempotence stricte avant `markIntentPaid` | **S** | Nous (code) + Pascal (doc/secret MVola) | Sinon trou de sécurité = création d'argent par requête forgée. |
| 5 | **Implémenter le payout (disbursement) MVola** + brancher `requestPayout` dessus | **L** | Pascal (droits disbursement MVola) + Nous (code) | Sans payout, le vendeur n'encaisse jamais réellement → promesse non tenue. |
| 6 | **Brancher l'escrow réel sur le shipment** : remplacer `releasePaymentSim` par lock/release `lib/escrow` adossé au wallet alimenté par MVola | **M** | Nous (code) | Relie livraison ↔ argent. Dépend de #3/#5. |
| 7 | **Supprimer `topup-test` (+10€ gratuits)** et clarifier la **devise** (wallet en cents EUR dans le code vs MGA/Ariary affiché) | **S** | Nous (code) + arbitrage Pascal | Intégrité monétaire. La double-unité (UI prompt en €, stockage "MGA") finira en bug de montants. |
| 8 | Orange Money + Airtel cash-in & payout (finir les scaffolds) | **L** | Pascal (onboarding marchand) + Nous | Couverture multi-opérateur (Telma seul ≠ suffisant à Mada). Après MVola validé. |
| 9 | Clé Brevo (envoi réel du lien) si on garde l'email en secours | **S** | Pascal (clé) | Évite d'exposer le lien magique en clair. |

---

## Top 5 risques

1. **ARGENT / promesse mensongère (critique).** Tout l'argent est **SIMULÉ** (`escrow.ts:11`, `shipment.ts:360-377`, `payments.ts:177-180`) et le **payout vendeur n'existe pour aucun opérateur**. Lancer en disant "vends et encaisse" = on promet de l'argent que le rail ne peut pas verser. Violation directe de la doctrine "jamais promettre d'argent tant que le rail n'est pas réel et vérifié".

2. **SÉCURITÉ paiement (critique au go-live).** Le webhook `app/api/payments/mvola/callback/route.ts` **n'authentifie pas l'appelant** (pas de signature, pas d'allowlist). Couplé à des `intent.id` = UUID + statut texte libre, un attaquant pourrait créditer un wallet en forgeant un POST une fois le rail "paid"-actif. À fermer AVANT toute mise en prod du rail.

3. **INTÉGRITÉ monnaie.** `topup-test` crédite **+10 € gratuits à tout user connecté** (`wallet/topup-test/route.ts:18`) et la **devise est incohérente** : l'UI wallet saisit des euros et fait `eur*100` (`app/wallet/page.tsx:120-121,140`), alors que `payment_intents`/`shipments` parlent de MGA/Ariary. Risque de montants faux et de fraude. À nettoyer avant argent réel.

4. **FIABILITÉ acheminement.** Le moteur shipment est bon mais **personne ne peut devenir porteur** (formulaire KYC cassé, `devenir-transporteur/page.tsx:104-148`). Sans porteurs vérifiés, `assignLeg`/`assignCarrierByPhone` échouent sur `cni_not_verified` → la livraison ne démarre jamais en conditions réelles (seule la `runDemo` avec bots fonctionne).

5. **RGPD / PII — globalement bien tenu, 1 point de vigilance.** Bon : CNI chiffrée (`transport-profile.ts:106` `encryptField`), photos/vidéo en dossier privé `data/cni/` mode 0o600 (`cni-upload/route.ts`), vues escrow sanitisées sans user_id tiers (`escrow.ts:138-161`), contacts acheminement masqués sans téléphone (`shipment.ts:492-519`). Vigilance : en l'absence de clé Brevo, le **lien magique (jeton de session) s'affiche en clair** dans la réponse API/écran (`signin/page.tsx:100-114`, `mailer.ts` fallback) — acceptable en dev, à désactiver en prod.

---

### Note de largeur (hors chemin critique, non bloquant pour Mada)
DJ, music-hub (port 3020), watch-together (WebRTC/SFU), jeux (chess/dame), AI-video studio (edge-tts/VRM), avatar 3D, developer platform : présents et volumineux, mais **sans impact sur vendre/encaisser/livrer**. Ils ajoutent de la surface (et de la dette) sans servir la promesse de lancement.
