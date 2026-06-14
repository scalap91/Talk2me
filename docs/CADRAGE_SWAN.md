# Note de cadrage — Swan (carte + Wallet pour tous les users T2M)

_Rédigé le 2026-06-10. Objectif : démocratiser la CB — chaque user T2M a un sous-compte + une carte virtuelle, paie en NFC (Google Pay) avec le solde de son Wallet._

⚠️ **À retenir avant tout** : les chiffres de prix/délais ci-dessous sont des **ordres de grandeur à confirmer avec le commercial Swan**. On ne s'engage sur rien tant que ce n'est pas LIVE (doctrine « vérifier le rail »).

---

## 1. Pourquoi Swan (et pas Qonto / nous-mêmes)
- On **ne peut pas émettre de carte ni détenir l'argent des users** sans licence (établissement de monnaie électronique). Interdit sinon.
- **Qonto** = nos cartes d'entreprise à nous, pas distribuables aux users, pas d'API d'émission. ❌
- **Swan** = BaaS français, **agréé EMI (ACPR)**, 100 % API. Il porte la licence, détient les fonds (ségrégués), gère le KYC, émet les cartes, et fait le **provisioning Apple/Google Pay**. Nous = distributeur technique. ✅
- Alternative équivalente : **Treezor** (groupe Société Générale) — plus lourd à intégrer. Swan = le plus simple pour démarrer.

## 2. Ce que Swan fournit (qui couvre exactement notre besoin)
- **Comptes / sous-comptes** : un IBAN par user (= le « sous-compte » que tu décris).
- **Cartes virtuelles** par user (+ physiques en option plus tard).
- **Tap-to-pay** : provisioning de la carte dans **Google Wallet / Apple Wallet** → le user paie en posant son téléphone sur le TPE. (C'est Google Pay + les tokens réseau Visa/MC qui font le NFC — pas nous.)
- **Recharge du Wallet** : virement SEPA entrant / carte → crédite le sous-compte.
- **KYC/KYB** : parcours d'onboarding fournis par Swan (vérif identité user + entreprise).
- **Webhooks** : transactions en temps réel → on branche notre ledger dessus.

## 3. Ce que Swan exige de NOUS (les prérequis durs)
1. **KYB entreprise** : immatriculation Genius Web, bénéficiaires effectifs, pièces. (Quelques jours à semaines.)
2. **Contrat de distribution** + revue compliance avant passage en production.
3. **KYC de chaque user** avant de lui donner carte/IBAN (Swan fournit le flow, mais c'est obligatoire — plus de compte 100 % anonyme).
4. **Vrai argent** : les fonds sont détenus chez Swan. Notre Wallet actuel (scoreboard) devient le **miroir** d'un vrai solde Swan.
5. **Zone EEE** : users en **Europe**. (cf. §6 géo.)

## 4. Coûts (ordres de grandeur — À CONFIRMER avec Swan)
Modèle typique BaaS :
- **Setup / mensuel plateforme** : forfait mensuel (qq centaines €/mois selon volume).
- **Par compte/IBAN ouvert** : petit montant unitaire.
- **Par carte** émise + **par carte dans Google Pay**.
- **Par transaction** (interchange — souvent on en TOUCHE une part, ça peut financer le modèle).
- **KYC** : coût par vérification d'identité.
> Bonne nouvelle : l'**interchange** (commission réseau sur chaque paiement) peut **nous rémunérer** → le modèle éco T2M ([[affiliation]] + interchange) tient.

## 5. Intégration technique (mappé sur notre code, par phases)
- **Wallet actuel** (`wallet_transactions`, solde = somme, escrow) = déjà le bon socle ledger. On le branche sur Swan.
- **Phase 0 — Sandbox** : compte Swan sandbox + clés API, on teste create-account / create-card / webhooks sans argent réel.
- **Phase 1 — Onboarding user** : KYC Swan déclenché à l'activation « carte » → crée le sous-compte (IBAN) du user.
- **Phase 2 — Carte virtuelle** : émission carte → affichée dans le Wallet T2M (numéro masqué, gérée côté Swan).
- **Phase 3 — Tap-to-pay** : bouton « Ajouter à Google Pay » → provisioning. Le user paie en NFC.
- **Phase 4 — Recharge + débit** : recharge SEPA/carte → solde Swan ; chaque paiement → webhook → maj du Wallet T2M en temps réel.
- **Phase 5 — Réconciliation** : le Wallet T2M = miroir fidèle du solde Swan (jamais recalculer, on retranscrit ce que Swan envoie).

## 6. Le piège géographique (important pour la vision distribution)
- **NFC tap-to-pay = terminaux EMV = Europe/France.** ✅ Swan = EEE.
- **Madagascar / Afrique** : TPE NFC rares → le rail réaliste reste **mobile money (Orange Money) + QR code**, PAS la carte Swan. → 2 rails distincts selon le marché. « Carte NFC pour tous » = produit **France/EU** d'abord.

## 7. Délais réalistes
- Onboarding KYB + contrat Swan : **2–6 semaines** (compliance).
- Intégration sandbox → MVP fonctionnel : **rapide** une fois les clés en main (notre Wallet est déjà prêt).
- Go-live production : après revue compliance Swan.

## 8. Décision / prochain pas
1. **Toi** : contacter Swan (swan.io → « Talk to sales »), lancer le KYB Genius Web, récupérer l'accès **sandbox** + clés API.
2. **Moi** : dès les clés sandbox → je branche create-account / carte / webhooks sur le Wallet et on teste end-to-end (argent fictif sandbox), screenshots à l'appui.
3. Go-live quand Swan valide la compliance.

**Rien n'est promis « live » tant que le sandbox ne tourne pas chez nous et que Swan n'a pas validé la prod.**

---

## 9. Pièces KYB à préparer (checklist)

### A. Société (Genius Web)
- [ ] **Extrait Kbis** récent (**< 3 mois**).
- [ ] **Statuts** à jour, signés (version complète).
- [ ] **SIREN / SIRET** + **n° TVA intracommunautaire**.
- [ ] **Justificatif d'adresse du siège** (facture, bail) si demandé.
- [ ] **RIB de l'entreprise** (compte d'alimentation / settlement).
- [ ] **Code APE/NAF** et description précise de l'activité.

### B. Bénéficiaires effectifs (UBO — toute personne détenant > 25 % ou contrôlant)
- [ ] **Registre des bénéficiaires effectifs (RBE)** / déclaration des BE.
- [ ] Pour **chaque UBO** : **pièce d'identité valide** (CNI ou passeport), **recto-verso**.
- [ ] **Justificatif de domicile** récent (< 3 mois) par UBO si demandé.
- [ ] **Organigramme de détention** si structure avec holding/sociétés mères.

### C. Représentant légal / signataire
- [ ] **Pièce d'identité** du gérant/président (recto-verso).
- [ ] Preuve du **pouvoir d'engager** la société (ressort en général du Kbis).
- [ ] Coordonnées (email pro, téléphone).

### D. Activité & flux de fonds (le plus scruté pour un distributeur de paiement)
- [ ] **Description du business model** T2M : qui paie qui, **d'où vient l'argent, où il va** (recharge Wallet → carte → paiement marchand).
- [ ] **Cas d'usage** précis : Wallet + cartes virtuelles aux users, paiement NFC.
- [ ] **Volumes prévisionnels** : nb d'users attendus, montant moyen, **volume mensuel estimé**.
- [ ] **Pays ciblés** (EEE pour les cartes ; mentionner que Mada = rail séparé).
- [ ] **Site / app** en ligne (preuve d'activité) : talk2me.fr + l'APK.
- [ ] **CGU/CGV** de Talk2Me.
- [ ] (Si société déjà ancienne) **derniers comptes annuels / bilan**. Pour une jeune structure : un **mini business plan** suffit souvent.

### E. Conformité (Swan fait le gros, mais peut demander)
- [ ] Point de contact **conformité/LCB-FT** côté Genius Web (peut être toi).
- [ ] Acceptation que **chaque user passe un KYC** avant d'avoir carte/IBAN.

> Astuce : prépare A + B + C en PDF propres **avant** d'appeler Swan → l'onboarding KYB est beaucoup plus rapide. Le point D (flux de fonds + volumes) est ce qui débloque ou ralentit le dossier : sois clair et honnête sur le modèle.
