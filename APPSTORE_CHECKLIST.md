# Talk2Me — Checklist soumission App Store (iOS) + Google Play

> Objectif : figer une bêta propre et préparer la soumission. **Ne rien publier** tant que les bloquants 🔴 ne sont pas levés.
> Dernière mise à jour : 2026-06-24. Base gelée : branche `beta` (commit `623fa99`).

---

## 0. Décisions actées (Pascal)
- **Bundle ID unifié : `com.talk2me.app`** (international = .com). L'Android passe de `fr.talk2me.app` → `com.talk2me.app` (rien n'est publié, changement propre).
- **Build iOS via CI cloud-Mac** (Codemagic ou EAS Build) — impossible de compiler iOS sur le serveur Linux. Pascal n'a pas besoin de posséder un Mac.
- **Compte Apple Developer 99 $/an** : À CRÉER (prérequis absolu, délai de validation Apple ~24-48h).

---

## 1. État des fonctionnalités (audit 2026-06-24)

### ✅ En place
| Fonction | Où |
|---|---|
| Déconnexion | `/api/auth/signout` + bouton Profil |
| Politique de confidentialité | `/legal/confidentialite` |
| CGU / Conditions d'utilisation | `/legal/cgu` |
| Mentions légales, cookies, RGPD, CGV | `/legal/*` (`lib/legal/content.ts`) |
| Wrap natif Android (Capacitor 6) | `/home/ubuntu/talk2me-android/` — APK validé S23 |
| Push natif FCM Android | `components/NativePush.tsx` |
| Permissions Android (caméra/micro/géoloc/notif) | `AndroidManifest.xml` |

### 🔴 Bloquants Apple (rejet automatique si absents — Guideline 1.2 contenu utilisateur + 5.1.1 compte)
| Fonction | État | Détail |
|---|---|---|
| **Suppression du compte in-app** | ❌ MANQUANT | Promise dans la FAQ mais pas codée. UI Profil + `DELETE /api/auth/delete` + purge données (soft-delete + anonymisation). |
| **Bloquer un utilisateur** | ❌ MANQUANT | Table `blocked_users` + API + bouton sur profil/conv. Masquer contenu des bloqués. |
| **Signaler un utilisateur** | ❌ MANQUANT | API `/api/reports` + bouton sur profil. |
| **Signaler un contenu** (card/post/message) | ❌ MANQUANT | Bouton sur chaque card/post + file de modération admin. |
| **Filtre + action sous 24h** (UGC) | ❌ MANQUANT | Apple exige : signaler + bloquer + retrait sous 24h + contact. Brancher file modération `/admin`. |

### 🟠 À vérifier / produire
| Élément | État |
|---|---|
| Projet iOS Capacitor (`ios/`) | ❌ à scaffolder (`npx cap add ios`) |
| `capacitor.config` partagé iOS+Android | 🟠 Android only aujourd'hui |
| Icône **1024×1024** (App Store) | ❌ on a 512 max → produire |
| Splash screen iOS | ❌ à produire |
| Version / build number | 🟠 à fixer (ex : 1.0.0 / build 1) |

---

## 2. Points bloquants (récap priorisé)

1. 🔴 **Fonctions UGC obligatoires** (suppression compte, bloquer, signaler user, signaler contenu) — sans ça = rejet garanti. → tâche #41.
2. 🔴 **iOS ne se compile pas ici** (Linux). Il faut le CI cloud-Mac + compte Apple Developer 99 $/an.
3. 🟠 **Risque « WebView = simple site » (Guideline 4.2)** : l'app charge `server.url` (site live). Apple peut rejeter les apps « juste un site web ». Atténuation : mettre en avant le natif (push, caméra, appels, partage) ; idéalement embarquer un minimum d'écran natif. À surveiller à la 1ʳᵉ soumission.
4. 🟠 **Certificat TLS apex** : `talk2me.fr` n'a que `www` dans le SAN (cf wrap Android). Réémettre certbot `talk2me.fr` + `www` pour éviter tout écran blanc WebView.
5. 🟠 **APK release signé** (keystore) pour Play Store — l'actuel est debug non signé prod.

---

## 3. Assets / icônes à produire
- [ ] **Icône App Store 1024×1024** (PNG, sans transparence, sans coins arrondis — Apple arrondit lui-même). Source : `public/icons/icon-512.png` (carré rouge) → régénérer en 1024 propre.
- [ ] Jeu d'icônes iOS (généré par `@capacitor/assets` depuis un master 1024).
- [ ] Splash screens iOS (light/dark).
- [ ] **Icône Play Store 512×512** + bannière fonctionnalités 1024×500.
- [ ] Icône adaptive Android (foreground + background).

## 4. Captures d'écran à réaliser (store listings)
### iOS (obligatoire au moins 6,7" + 6,5")
- [ ] iPhone 6,7" (1290×2796) — ×3 à 5
- [ ] iPhone 6,5" (1242×2688) — ×3 à 5
- [ ] (iPad 12,9" si app universelle)
Écrans à montrer : feed Hub, une conversation + IA, le Shop (boutiques), une boutique avec achat protégé, le Wallet, un appel.
### Android (Play)
- [ ] Téléphone (min 2, 1080×1920+) — ×4 à 8
- [ ] Icône 512 + bannière 1024×500

## 5. Métadonnées store (à rédiger)
- [ ] Nom : **Talk2Me**
- [ ] Sous-titre (iOS, 30 car.)
- [ ] Description (FR + EN)
- [ ] Mots-clés (iOS)
- [ ] Catégorie : Réseaux sociaux
- [ ] Âge : 12+ (UGC) ou 17+ selon modération
- [ ] URL support + URL marketing + URL confidentialité (→ `https://talk2me.fr/legal/confidentialite`)
- [ ] **Apple : étiquette de confidentialité (App Privacy)** — déclarer données collectées (compte, contacts, localisation, paiement).
- [ ] **Google : Data Safety form** (équivalent).
- [ ] Compte de démo Apple (login de test + mot de passe pour les reviewers).

## 6. Préparation App Store Connect (étapes, NE PAS publier)
1. [ ] Créer le compte Apple Developer (99 $/an), accepter les accords.
2. [ ] App Store Connect → créer l'app (Bundle ID `com.talk2me.app`, nom Talk2Me).
3. [ ] Créer le Bundle ID + capabilities (Push Notifications) dans le portail Developer.
4. [ ] Brancher le CI cloud-Mac (Codemagic/EAS) sur le repo → build signé + upload TestFlight.
5. [ ] Remplir fiche + captures + privacy labels.
6. [ ] **TestFlight d'abord** (test interne) avant toute soumission review.

## 7. Préparation Google Play (parallèle)
1. [ ] Compte Play Console (25 $ une fois).
2. [ ] Aligner `applicationId` → `com.talk2me.app`, versionCode/versionName.
3. [ ] Build **AAB release signé** (keystore prod, à sauvegarder précieusement).
4. [ ] Data Safety + politique de confidentialité + captures.
5. [ ] Test interne (track interne) avant production.

---

## 8. Ordre de travail recommandé
1. **Geler beta** ✅ (commit `623fa99`) — reste : créer le dépôt GitHub puis `git push` (clé SSH `scalap91` OK).
2. **Construire les fonctions UGC obligatoires** (#41) — le vrai chantier code.
3. **Scaffold iOS** + bundle id + Info.plist + icône 1024 (#40).
4. **Brancher CI cloud-Mac** → premier build TestFlight.
5. Captures + métadonnées + privacy labels.
6. Aligner Android (com.talk2me.app + AAB signé) en parallèle.

> Rien n'est soumis tant que les 🔴 ne sont pas verts et que Pascal n'a pas validé chaque étape.
