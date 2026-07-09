/**
 * lib/schema/registry — SOURCE DE VÉRITÉ UNIQUE du « jumeau numérique » T2M (Pascal
 * 2026-06-30). La boussole (/schema/decoupage + /schema/module/[key]) se rend
 * ENTIÈREMENT à partir de ce registre. Doctrine : aucune donnée inventée — un champ
 * inconnu reste vide (« à documenter »), jamais bidonné. Le statut est l'état DÉCLARÉ
 * (curé à la main, honnête), distinct du diagnostic LIVE (présence des clés env,
 * calculé au runtime dans la fiche, jamais la valeur). Phase 1 du cockpit.
 */

export type ModStatus = 'ok' | 'partial' | 'dev' | 'error' | 'off';

export const STATUS_META: Record<ModStatus, { dot: string; label: string }> = {
  ok: { dot: '🟢', label: 'Fonctionnel' },
  partial: { dot: '🟠', label: 'Configuration incomplète' },
  dev: { dot: '🔵', label: 'En développement' },
  error: { dot: '🔴', label: 'Erreur' },
  off: { dot: '⚫', label: 'Désactivé' },
};

export type TeamKey =
  | 'design' | 'front' | 'back' | 'ia' | 'commerce'
  | 'paiement' | 'infra' | 'securite' | 'analytics';

export const TEAMS: Record<TeamKey, { name: string; emoji: string; scope: string }> = {
  design: { name: 'Design', emoji: '🎨', scope: 'Rendu, responsive, UI/UX, animations, icônes, thèmes, accessibilité.' },
  front: { name: 'Front-End', emoji: '💻', scope: 'Composants, navigation, affichage, PWA/APK, performance graphique.' },
  back: { name: 'Back-End', emoji: '⚙️', scope: 'API, logique métier, auth, permissions, synchronisation, couche données.' },
  ia: { name: 'IA', emoji: '🤖', scope: 'LLM, function-calling, voix/vidéo, mémoire, agents, vision.' },
  commerce: { name: 'Commerce', emoji: '🛒', scope: 'Fournisseurs (AliExpress/Banggood/BigBuy), catalogue, boutiques, affiliation.' },
  paiement: { name: 'Paiements', emoji: '💳', scope: 'Stripe, PaPi, Orange Money, escrow, commissions, versements.' },
  infra: { name: 'Infrastructure', emoji: '☁️', scope: 'VPS, PM2/blue-green, GPU, DB, cache/storage seams, sauvegardes.' },
  securite: { name: 'Sécurité', emoji: '🔒', scope: 'PII air-gap, chiffrement E2EE, permissions, audit, journalisation.' },
  analytics: { name: 'Analytics', emoji: '📊', scope: 'Statistiques, métriques, logs, dashboards, monitoring fonctionnel.' },
};

export interface ModuleEntry {
  key: string;
  name: string;
  emoji: string;
  team: TeamKey;
  status: ModStatus;
  description: string;
  objectif: string;
  apis: string[];       // APIs externes appelées
  services: string[];   // services internes connectés
  dbs: string[];        // modules data / tables
  deps: string[];       // autres modules dont il dépend (keys)
  env: string[];        // NOMS de variables d'env (présence vérifiée live, jamais la valeur)
  endpoints: string[];  // endpoints représentatifs
  keys: string[];       // clés API nécessaires + état
  todos: string[];
  bugs: string[];
}

const M = (m: ModuleEntry) => m;

export const MODULES: ModuleEntry[] = [
  M({
    key: 'audit', name: 'Audit fonctionnel — coquilles à corriger', emoji: '🧭', team: 'back', status: 'error',
    description: 'Findings de l’audit fonctionnel de toute l’app (20 modules audités, 14 critiques + 29 high, 2026-07-09). bugs[] = CRITIQUES (bloquant / argent / données), todos[] = HIGH. À vider au fur et à mesure (phase coding).',
    objectif: 'Ordre de bataille : ARGENT d’abord (cash-out prod, rails OM/Airtel HTTP, commission dropship), puis SÉCURITÉ (owner colis transport, modération signalements orpheline Apple 1.2), puis parcours cassés (endpoint boutique publique, plats maison 500m, POST posts). Module par module.',
    apis: [], services: [], dbs: [], deps: [], env: [],
    endpoints: [], keys: [],
    todos: [
      'auth-inscription — Deletion UI (/suppression-compte) est statique, pas de bouton in-app (/app/suppression-compte/page.tsx:1-44)',
      'chat-discussions — Menu suppression message absent côté UI (components/conversation/UnifiedBubble.tsx:150)',
      'chat-discussions — Jeux : aucune vérification .ok sur POST find-or-create (app/c/[conv_id]/page.tsx:509-514)',
      'ia-lea — Avatar vidéo (photo→I2V) : UI client MANQUANTE (app/api/avatar/video/[id]/route.ts)',
      'ia-lea — Salle 3D (perceive/hear/voice) : orchestre client MANQUANT (app/api/avatar/perceive|hear|voice/route.ts)',
      'ia-lea — Avatar 3D (ReadyPlayerMe GLB) : importé en DB mais jamais rendu (app/api/avatar-rpm/route.ts)',
      'boutique-shop — Deux systèmes boutique non unifiés : boutiques vs simple_shops (app/boutique/[id] vs app/ma-boutique/[id])',
      'commerce-paiement — Stripe (recharge par carte) jamais implémenté (app/wallet/page.tsx:13-14)',
      'commerce-paiement — Lien affilié / tracking source absence totale (app/monetisation/page.tsx:48-50)',
      'commerce-paiement — Boutique LIVE (simple-shop) vs legacy (table boutiques) double canon (lib/commerce-resolve.ts:41-98)',
      'Eat — OSM sync détecte « gone » mais jamais nettoyé auto → peut polluer base (lib/eat-listings.ts:167-187)',
      'Eat — Section Eat OFF mais aucun message user explique pourquoi (components/feed/AcheterHub.tsx:71-72)',
      'drive-transport — Upload CNI ni chiffré, ni protégé en lecture (lib/transport-profile.ts:26-42)',
      'drive-transport — Décision booking (accept/refuse) appelle decide() sans implémentation DB (components/drive/MyRentalsSheet.tsx:41-51)',
      'drive-transport — declareTrip sans vérifier CNI status du porteur (app/api/transport/trips/route.ts:12-18)',
      'annonces-radar — Réservation immobilier ne filtre PAS annonce_on (lib/simple-shop.ts:304)',
      'dropshipping — Bouton Commander (ProductDetailSheet) sans handler (components/boutique/ProductDetailSheet.tsx:236)',
      'dropshipping — User commission ledger jamais alimenté pour ventes dropship (lib/db-commerce.ts:59-84)',
      'calls-sfu — Pas de reconnect SFU si transport DTLS down (components/sfu/SfuRoom.tsx:28)',
      'status-stories — (vérifier v1303) Items boutique manquent bouton Acheter (components/status/StatusBar.tsx:176-182)',
      'status-stories — (vérifier v1303) Incohérence devise Ar vs MGA (components/status/StatusBar.tsx:181)',
      'friends-parrainage — declineReq() ne recharge pas les données (app/friends/page.tsx:243-245)',
      'embeds-hub — Boutons action share/save/comment/custom sans handler (components/embed-hub/UnifiedCardRenderer.tsx:314-322)',
      'embeds-hub — Facebook extractor sans embed iframe (lib/embed-hub/extractors/facebook.ts:68-76)',
      'biz-entreprise — Réponse IA échoue silencieusement sans DEEPSEEK_API_KEY (lib/biz-ai.ts:19-20)',
      'admin — API /api/admin/permissions sans UI (app/api/admin/permissions/route.ts:25-44)',
      'admin — API /api/admin/contributors sans UI (app/api/admin/contributors/route.ts:16-31)',
      'profile — Pages de paramètres manquantes (app/profile/page.tsx:261-263)',
      'profile — Page notifications complètement vide (app/notifications/page.tsx)',
    ],
    bugs: [
      '✅ [FIXÉ v1311] commerce-paiement — Cash-out débloqué via adapter.disburse + sandbox mock, prouvé E2E (lib/payments.ts requestPayout)',
      '✅ [SANDBOX v1314] commerce-paiement — 3 opérateurs (Orange/Airtel/MVola) simulés E2E collect+disburse (MM_MOCK). Vrai HTTP réel à brancher à réception des clés Orange/Airtel',
      '✅ [FIXÉ v1317] dropshipping — Commission promoteur au paiement (10% de notre marge, réglable admin) prouvée E2E ; cjCreateOrder (fulfillment CJ) = reste à faire « demain » (lib/payments.ts creditAffiliate)',
      '✅ [FIXÉ v1319] annonces-radar — Throttle anti-spam sur boost/réservation (429 si trop d’intents en attente). NB : paiement EXTERNE (PaPi), pas de wallet à débiter → « balance » sans objet ; effet seulement après paiement réel',
      '✅ [FAUX POSITIF vérifié] drive-transport — owner check PRÉSENT : assignLeg exige custody_user_id==requester (ou le porteur) (lib/shipment.ts:213) ; assignCarrierByPhone exige custody (lib/shipment.ts:245). Un tiers ne peut pas assigner le colis d’autrui.',
      '✅ [FIXÉ v1323] admin — File de modération branchée : UI /admin/moderation consomme l’API (signalements users+contenu, Résoudre/Rejeter, âge >24h en rouge pour Apple 1.2)',
      '✅ [FAUX POSITIF vérifié + nettoyé v1331] boutique-shop — /api/simple-shop/[id]?key= IGNORE l’id quand key présent → l’endpoint marchait (testé : renvoie le shop). Le `x` littéral trompait ; renommé `by-key` pour la clarté',
      '✅ [FIXÉ v1332] boutique-shop — plus de clic-vide : Messagerie branchée (/shop/messages), Booster + Envoyer désactivés honnêtes (badge « Bientôt »). Vrais features = tâches #74 (boost) + #75 (envoi contact)',
      '✅ [FIXÉ v1335] Eat — Plats de Mama hyper-local : 500m défaut, 1km max si aucun voisin (auto-élargit UNE fois). Rayons RÉGLABLES ADMIN (registre OPS_SETTINGS + /api/admin/settings)',
      '✅ [FIXÉ v1334] feed-posts — POST /api/posts renvoie is_owner=true/liked_by_me=false sur le post créé (plus de dépendance au reload)',
      '🟠 chat — E2EE : Phase 0 (clés) + Phase 1 (chiffrement messages amis↔amis send/receive, v1328) LIVRÉES. Repli clair si pas de clé. À VALIDER sur 2 tels (WebCrypto = navigateur). Reste Phase 2 (Léa sur tag envoie le clair depuis le tel) + groupes/legacy',
      '✅ [FIXÉ v1337] status-stories — upload vidéo de story autorisé (accept image/*,video/* ; le handler détectait déjà video/*)',
      '🔴 music [audit #68] — MUSIC_HUB_API_KEY absent (.env.local) → proxies music-hub (search/trending/artists) vides → AUCUN son en Tendance/Artistes/Recherche (lib/music-hub-client.ts:39). = intégration music-hub #1 pas branchée',
      '🟠 music [audit #68] — mode DJ démarre liste VIDE en SILENCE si music-hub down/clé absente, aucune erreur user (DJConsole.tsx:51-53)',
      '✅ [FIXÉ v1337] auth — lien de parrainage invalide (404) affiche désormais « Ce lien n’est plus valide, tu peux quand même rejoindre » (app/r/[code]/page.tsx)',
    ],
  }),
  M({
    key: 'auth', name: 'Authentification', emoji: '🔑', team: 'securite', status: 'ok',
    description: 'Sessions, magic links, inscription par téléphone (OTP SMS Retriever) et par email.',
    objectif: 'Identifier l’utilisateur de façon sûre, sans jamais exposer de PII dans les tuyaux IA.',
    apis: ['Brevo (email)', 'SMS OTP'], services: ['db-sessions', 'db-users'],
    dbs: ['lib/db-sessions.ts', 'lib/db-users.ts', 'tables sessions/magic_links'],
    deps: ['users', 'securite'], env: [],
    endpoints: ['GET /api/auth/me', 'POST /api/auth/phone', 'magic link'],
    keys: ['Brevo (email transactionnel)'],
    todos: ['Durcir rate-limit OTP'], bugs: [],
  }),
  M({
    key: 'users', name: 'Utilisateurs', emoji: '👤', team: 'back', status: 'ok',
    description: 'Comptes, profils, talk2me_id, recherche d’utilisateurs, avatars IA.',
    objectif: 'Gérer l’identité publique (username/display) et le profil, isolé de la PII.',
    apis: [], services: ['db-users'], dbs: ['lib/db-users.ts', 'table users'],
    deps: ['auth'], env: [],
    endpoints: ['GET /api/users/search', 'GET /u/[username]', 'parrainage /r/[code]'],
    keys: [],
    todos: ['Cross-user IA tag mode neutral (#4)'], bugs: [],
  }),
  M({
    key: 'chat', name: 'Chat & Conversations', emoji: '💬', team: 'back', status: 'ok',
    description: 'Conversations solo/P2P/groupes, messages CRUD, présence, activités synchronisées, jeux.',
    objectif: 'Tout vit dans la conversation : messages, cards, appels, activités greffées.',
    apis: [], services: ['db-conversations', 'db-messages'],
    dbs: ['lib/db-conversations.ts', 'lib/db-messages.ts'],
    deps: ['users', 'ia', 'cartes'], env: [],
    endpoints: ['GET /api/conversations', 'POST /api/conversations/[id]/messages'],
    keys: [],
    todos: ['Suppression messages + long-press (#22)'], bugs: [],
  }),
  M({
    key: 'ia', name: 'IA (Léa)', emoji: '🤖', team: 'ia', status: 'ok',
    description: 'LLM function-calling (toolkit search/geo/wiki…), mémoire persistante par user, scrubbers PII, vision.',
    objectif: 'L’IA AGIT (cherche + propose des cards), raisonne sur la phrase complète, jamais d’excuses.',
    apis: ['LLM (DeepSeek/compat)', 'Vision (OpenAI-compat)', 'OSM/Nominatim', 'Wikipedia'],
    services: ['db-memories', 'db-route-learnings', 'toolkit IA'],
    dbs: ['lib/db-memories.ts', 'lib/db-route-learnings.ts', 'table ai_memories'],
    deps: ['chat', 'recherche', 'cartes', 'securite'],
    env: ['VISION_API_KEY', 'VISION_BASE_URL', 'VISION_MODEL'],
    endpoints: ['POST /api/chat'],
    keys: ['Clé LLM', 'Vision (présente)', 'YouTube Data / Spoonacular / OpenWeather (en attente)'],
    todos: ['Cron auto-amélioration Léa (#15)', 'Audit intents 20 prompts (#18)'],
    bugs: ['GPU local planté (n’affecte pas le cœur via API)'],
  }),
  M({
    key: 'composer', name: 'Composer multi-canal', emoji: '✍️', team: 'front', status: 'ok',
    description: 'Édition de posts/cards + « Décliner pour… » (formats réseaux 1:1/9:16/16:9) + partage natif.',
    objectif: '1 post → tous les formats réseaux, sans API tierce (v245).',
    apis: ['Web Share API'], services: ['db-direct-cards', 'db-posts'],
    dbs: ['lib/db-posts.ts'], deps: ['cartes', 'social'], env: [],
    endpoints: ['POST /api/cards/create', 'POST /api/posts'], keys: [],
    todos: ['Matrice publication réseaux via API (futur)'], bugs: [],
  }),
  M({
    key: 'video', name: 'Vidéo', emoji: '🎬', team: 'ia', status: 'partial',
    description: 'Éditeur VideoCard (overlays/tabs/meta) + avatar IA photo→vidéo (HunyuanVideo GPU).',
    objectif: 'Créer/éditer des VideoCards et des avatars animés.',
    apis: ['HunyuanVideo (GPU)'], services: ['VideoCardEditor'],
    dbs: [], deps: ['composer', 'infra'], env: [],
    endpoints: ['POST /api/cards/editor/apply-video-ops'], keys: [],
    todos: ['Finir modularisation VideoCardEditor (publish/baking)'], bugs: ['GPU planté → avatar vidéo HS'],
  }),
  M({
    key: 'audio', name: 'Audio & Musique', emoji: '🎵', team: 'front', status: 'dev',
    description: 'Music-hub (961 tracks/97 artistes), Memory Score « Pour moi », Mode DJ (scratch Web Audio).',
    objectif: 'Biblio musicale + recommandation perso + platines.',
    apis: ['YouTube (embed)'], services: ['music-hub (port 3020)'],
    dbs: ['music-hub DB'], deps: ['cartes', 'analytics'], env: [],
    endpoints: ['music-hub #422 (module isolé)'], keys: ['YouTube Data (en attente)'],
    todos: ['Intégration music-hub dans T2M (#1)', 'Greffer DJ live'], bugs: [],
  }),
  M({
    key: 'boutique', name: 'Boutique & Catalogue', emoji: '🛍️', team: 'commerce', status: 'partial',
    description: 'Boutique générale (Shop) + dropship multi-fournisseurs + boutiques perso + wallet/boost + annonces.',
    objectif: 'Vendre/partager accessible au petit particulier, plus vite que Wix ; affiliation à l’owner du post.',
    apis: ['AliExpress DS', 'Banggood', 'BigBuy'], services: ['db-commerce', 'shop-db'],
    dbs: ['lib/db-commerce.ts', 'lib/shop-db.ts', 'tables boutiques/shop'],
    deps: ['cartes', 'paiement', 'publicite'],
    env: ['ALIEXPRESS_DS_APP_KEY', 'ALIEXPRESS_DS_APP_SECRET', 'BANGGOOD_APP_ID', 'BANGGOOD_APP_SECRET', 'BIGBUY_API_KEY', 'BIGBUY_BASE'],
    endpoints: ['GET /api/shop/store', 'POST /api/shop/store/import-ae', 'GET /api/boutiques'],
    keys: ['AliExpress (présente)', 'Banggood (en attente Pascal)', 'BigBuy sandbox (en attente)'],
    todos: ['Agent Marchand (#25)', 'Brancher Banggood/BigBuy à réception clés', 'Vetting vision photos'],
    bugs: [],
  }),
  M({
    key: 'paiement', name: 'Paiement', emoji: '💳', team: 'paiement', status: 'dev',
    description: 'Encaissement (Orange Money WebPay, Stripe), escrow, versements (Paysend), commissions/part T2M.',
    objectif: 'Encaisser + verser + garder notre part dans le wallet, rail sérieux (vérifier LIVE pas test).',
    apis: ['Orange Money WebPay', 'Stripe', 'Paysend', 'PaPi.mg'], services: ['wallet (db-commerce)'],
    dbs: ['table wallet_transactions'], deps: ['boutique', 'livraison'], env: [],
    endpoints: ['POST /api/payments/* (à brancher)'], keys: ['Orange Money (en attente clés)', 'Stripe', 'PaPi (KYC en cours)'],
    todos: ['Brancher OM WebPay sandbox', 'Webhook + watchdog Telegram', 'Escrow'], bugs: [],
  }),
  M({
    key: 'livraison', name: 'Livraison & Drive', emoji: '🛵', team: 'back', status: 'dev',
    description: 'Écosystème Talk : SMS Talk, appels, livreurs/courses (Talk N Drive), favoris, adresses, suivi live.',
    objectif: 'Orchestration asset-light du transport informel (Madagascar) ; même moteur Eat/Drive/Transport.',
    apis: ['Géoloc / OSM'], services: ['db-drive'], dbs: ['lib/db-drive.ts', 'tables drivers/rides/sms'],
    deps: ['paiement', 'chat'], env: [],
    endpoints: ['GET /api/drivers/nearby', 'POST /api/rides', 'GET /api/sms'],
    keys: [], todos: ['Talk N Drive MVP (#23)', 'Tracking live', 'Appel livreur simulé à l’arrivée'], bugs: [],
  }),
  M({
    key: 'notifications', name: 'Notifications', emoji: '🔔', team: 'infra', status: 'partial',
    description: 'Watchdog Telegram (tout pipeline qui peut foirer en silence doit aboyer), alertes système.',
    objectif: 'Aucune panne silencieuse ; alerter sur erreurs/quotas/écarts.',
    apis: ['Telegram Bot'], services: ['watchdog'], dbs: [], deps: ['monitoring'], env: [],
    endpoints: ['—'], keys: ['Telegram bot token'],
    todos: ['Push web/app utilisateur', 'Couvrir tous les pipelines critiques'], bugs: [],
  }),
  M({
    key: 'cartes', name: 'Cartes (Cards)', emoji: '🃏', team: 'front', status: 'ok',
    description: 'Cœur produit : UnifiedCard (lien → carte via embed-hub), cards directes en conv, CRUD complet (soft-delete/archive/likes).',
    objectif: 'Privilégier les cards au texte ; cards vivantes/réutilisables, render uniforme + fallback gracieux.',
    apis: ['embed-hub (YT/TikTok/Spotify/Maps/articles/PDF)'], services: ['db-direct-cards', 'embed-hub'],
    dbs: ['lib/db-direct-cards.ts'], deps: ['recherche'], env: [],
    endpoints: ['GET /api/embed-hub?url=', 'POST /api/cards/create'], keys: [],
    todos: ['Migration Universal Embed Hub (5 phases)'], bugs: [],
  }),
  M({
    key: 'recherche', name: 'Recherche', emoji: '🔎', team: 'back', status: 'ok',
    description: 'Index de recherche cards FTS5, recherche posts, ranking feed.',
    objectif: 'Retrouver cards/posts/users rapidement, alimenter le feed mixé.',
    apis: [], services: ['db-posts (FTS5)'], dbs: ['index FTS5 (lib/db-posts.ts)'],
    deps: ['cartes', 'social'], env: [], endpoints: ['recherche interne'], keys: [],
    todos: [], bugs: [],
  }),
  M({
    key: 'social', name: 'Social & Feed', emoji: '🌐', team: 'back', status: 'ok',
    description: 'Feed unifié (mixé/ranked/recent), posts/clips de conversation, amis, présence, T2M Officiel.',
    objectif: 'Hub de navigation : on arrive par le feed, on sort par le feed (règle d’or).',
    apis: [], services: ['db-posts (Feed)', 'db-friendships'],
    dbs: ['lib/db-posts.ts', 'lib/db-friendships.ts'], deps: ['users', 'cartes'], env: [],
    endpoints: ['GET /api/feed', 'GET /home', 'GET/POST /api/friends'], keys: [],
    todos: ['Card Events Log (#7)'], bugs: [],
  }),
  M({
    key: 'publicite', name: 'Publicité & Affiliation', emoji: '📣', team: 'commerce', status: 'dev',
    description: 'Affiliation contextuelle (route via notre compte affilié, reverse une part à l’user), boost de cards.',
    objectif: 'Modèle éco = affiliation naturelle, jamais pub agressive ; attribuée à l’owner du post.',
    apis: ['réseaux affiliés'], services: ['boost (db-commerce)'], dbs: [],
    deps: ['boutique', 'analytics'], env: [], endpoints: ['—'], keys: [],
    todos: ['Tracking affiliation bout-en-bout', 'Reversement part user'], bugs: [],
  }),
  M({
    key: 'analytics', name: 'Analytics', emoji: '📊', team: 'analytics', status: 'dev',
    description: 'Memory Score (écoute pondérée récence), statistiques posts/cards, métriques produit.',
    objectif: 'Mesurer l’usage réel (capteur), recouper les chiffres (compteur vs réalité).',
    apis: [], services: ['memory-score'], dbs: ['stats posts/cards'], deps: ['social', 'audio'], env: [],
    endpoints: ['—'], keys: [], todos: ['Tableau de bord desktop (#19)'], bugs: [],
  }),
  M({
    key: 'monitoring', name: 'Monitoring', emoji: '🩺', team: 'analytics', status: 'partial',
    description: 'dashboard-api (PM2), watchdog pipelines, santé des services, logs.',
    objectif: 'Voir l’état des services en un coup d’œil ; alerter avant la panne.',
    apis: [], services: ['dashboard-api', 'watchdog'], dbs: [], deps: ['notifications', 'infra'], env: [],
    endpoints: ['dashboard-api (polling)'], keys: [],
    todos: ['Centre de diagnostic live dans la boussole (phase 2 cockpit)'], bugs: [],
  }),
  M({
    key: 'infrastructure', name: 'Infrastructure', emoji: '☁️', team: 'infra', status: 'partial',
    description: 'PM2 blue-green (déploiement zéro-coupure), nginx, better-sqlite3, seams cache (Redis-ready) + storage (S3-ready), PWA/APK.',
    objectif: 'Tenir la charge et préparer le multi-serveur (millions d’users) sans rewrite.',
    apis: [], services: ['PM2', 'nginx', 'lib/cache.ts', 'lib/storage.ts'],
    dbs: ['lib/db-core.ts (socle : connexion + schéma)'], deps: ['securite'],
    env: ['CACHE_BACKEND', 'STORAGE_BACKEND'],
    endpoints: ['blue-green 3010/3011'], keys: [],
    todos: ['Migration Postgres + Redis + object storage', 'App stateless + load-balancer', 'Réparer GPU'],
    bugs: ['GPU planté'],
  }),
  M({
    key: 'securite', name: 'Sécurité', emoji: '🔒', team: 'securite', status: 'ok',
    description: 'PII air-gap (talk2me_id/email/IP/tokens jamais dans les tuyaux IA), scrubbers regex, E2EE par défaut (P2P), scope amis strict.',
    objectif: 'Aucune fuite PII ; chiffré par défaut, ouvert seulement sur tag explicite.',
    apis: [], services: ['scrubbers', 'PII air-gap'], dbs: [], deps: [], env: [],
    endpoints: ['transverse'], keys: [],
    todos: ['Connected Accounts Hub (OAuth, tokens chiffrés) — Phase 0 (#9)', 'File de modération <24h (#43)'],
    bugs: [],
  }),
  M({
    key: 'administration', name: 'Administration', emoji: '🛠️', team: 'back', status: 'partial',
    description: 'Mode admin (boutons gated), curation Découvertes, file de modération signalements, gestion contenus.',
    objectif: 'Piloter contenus/curation/modération sans toucher au code.',
    apis: [], services: ['admin curation'], dbs: [], deps: ['securite', 'social'], env: [],
    endpoints: ['/admin/curation', 'mode admin (localStorage gate)'], keys: [],
    todos: ['File de modération <24h (#43)', '/admin/curation (#13)'], bugs: [],
  }),
];

/* ===================== Parcours de requête (flows) =====================
 * « On doit voir immédiatement où passe une requête. » Chaque étape pointe vers
 * un module (hérite de son statut réel) ou un service externe (statut optionnel).
 * La santé d'un flux = sa pire étape (un GPU planté rend le flux 🔴, pour de vrai).
 */
export interface FlowStep { label: string; moduleKey?: string; status?: ModStatus }
export interface Flow { key: string; name: string; desc: string; steps: FlowStep[] }

export const FLOWS: Flow[] = [
  {
    key: 'login', name: 'Connexion', desc: 'Un utilisateur ouvre l’app et arrive sur le feed.',
    steps: [
      { label: '👆 Utilisateur' },
      { label: 'Authentification', moduleKey: 'auth' },
      { label: 'Utilisateurs', moduleKey: 'users' },
      { label: 'Social / Feed', moduleKey: 'social' },
      { label: '🖥️ /home (affichage)' },
    ],
  },
  {
    key: 'resto', name: '« J’ai faim » → resto (IA proactive)', desc: 'L’IA agit : cherche un resto et propose une card, sans qu’on quitte la conversation.',
    steps: [
      { label: '👆 Utilisateur' },
      { label: 'Chat', moduleKey: 'chat' },
      { label: 'IA (Léa)', moduleKey: 'ia' },
      { label: '🌍 OSM / Nominatim', status: 'ok' },
      { label: 'Carte resto', moduleKey: 'cartes' },
      { label: '🖥️ Feed (affichage)' },
    ],
  },
  {
    key: 'buy', name: 'Achat produit (dropship)', desc: 'Du clic produit jusqu’à la livraison.',
    steps: [
      { label: '👆 Utilisateur' },
      { label: 'Boutique', moduleKey: 'boutique' },
      { label: '📦 AliExpress DS', status: 'ok' },
      { label: 'Paiement (escrow)', moduleKey: 'paiement' },
      { label: 'Livraison / Drive', moduleKey: 'livraison' },
      { label: 'Notification', moduleKey: 'notifications' },
    ],
  },
  {
    key: 'publish', name: 'Publier une card', desc: 'D’une conversation à une card publique indexée.',
    steps: [
      { label: '👆 Utilisateur' },
      { label: 'Composer', moduleKey: 'composer' },
      { label: 'Cartes (embed-hub)', moduleKey: 'cartes' },
      { label: 'Social / Feed', moduleKey: 'social' },
      { label: 'Recherche (FTS5)', moduleKey: 'recherche' },
    ],
  },
  {
    key: 'voice', name: 'Voix / vidéo (avatar)', desc: 'Pipeline de génération vocale/vidéo — dépend du GPU (actuellement planté).',
    steps: [
      { label: '👆 Utilisateur' },
      { label: 'Composer', moduleKey: 'composer' },
      { label: 'IA (Léa)', moduleKey: 'ia' },
      { label: '🎙️ Whisper', status: 'partial' },
      { label: '🔊 XTTS', status: 'partial' },
      { label: '🎮 GPU', status: 'error' },
      { label: 'Vidéo', moduleKey: 'video' },
      { label: '📤 Publication' },
    ],
  },
  {
    key: 'message', name: 'Message à un ami (P2P)', desc: 'Chiffré par défaut (E2EE), rien ne sort de la conversation.',
    steps: [
      { label: '👆 Utilisateur' },
      { label: 'Chat', moduleKey: 'chat' },
      { label: 'Sécurité (E2EE)', moduleKey: 'securite' },
      { label: '✉️ Messages (db-messages)' },
      { label: 'Notification', moduleKey: 'notifications' },
    ],
  },
];

/* ===================== Rôles & permissions =====================
 * « Chaque utilisateur appartient à une ou plusieurs équipes ; les droits sont
 * attribués par rôle. Chacun ne voit que les modules qui le concernent. »
 * Ici : périmètre de VUE par rôle (filtre du cockpit) + capacités déclarées.
 * L'enforcement par compte authentifié = étape future (binding à l'auth réelle).
 */
export interface Role {
  key: string; name: string; emoji: string;
  teams: 'all' | TeamKey[];
  sensitive: boolean;   // peut modifier les paramètres sensibles (clés, infra)
  caps: string[];       // capacités déclarées (lisibles)
}

export const ROLES: Role[] = [
  { key: 'admin', name: 'Administrateur', emoji: '👑', teams: 'all', sensitive: true, caps: ['Accès complet', 'Modifie tout (y compris paramètres sensibles)'] },
  { key: 'lead-tech', name: 'Lead Technique', emoji: '🧭', teams: 'all', sensitive: false, caps: ['Tous les modules techniques', 'Vue globale', 'Pas de modif des secrets'] },
  { key: 'chef-projet', name: 'Chef de projet', emoji: '📋', teams: 'all', sensitive: false, caps: ['Vue globale (lecture)', 'Suivi roadmap/statuts', 'Pas de modif sensible'] },
  { key: 'qa', name: 'QA', emoji: '🧪', teams: 'all', sensitive: false, caps: ['Accès aux tests & bugs', 'Diagnostic', 'Lecture'] },
  { key: 'designer', name: 'Designer', emoji: '🎨', teams: ['design', 'front'], sensitive: false, caps: ['UI/UX, responsive, composants', 'Pas d’accès paiement/infra'] },
  { key: 'dev-backend', name: 'Dév Back-End', emoji: '⚙️', teams: ['back'], sensitive: false, caps: ['API, logique métier, couche données'] },
  { key: 'dev-ia', name: 'Dév IA', emoji: '🤖', teams: ['ia'], sensitive: false, caps: ['LLM, voix/vidéo, mémoire, agents'] },
  { key: 'dev-commerce', name: 'Dév Commerce', emoji: '🛒', teams: ['commerce'], sensitive: false, caps: ['Boutique, fournisseurs, catalogue, affiliation'] },
  { key: 'dev-paiement', name: 'Dév Paiement', emoji: '💳', teams: ['paiement'], sensitive: true, caps: ['Stripe, Orange Money, escrow, commissions'] },
  { key: 'dev-infra', name: 'Dév Infra/Sécu', emoji: '☁️', teams: ['infra', 'securite'], sensitive: true, caps: ['VPS, DB, cache/storage, sécurité, monitoring'] },
];

export function getRole(key: string): Role | undefined {
  return ROLES.find((r) => r.key === key);
}

/** Modules visibles pour un rôle (filtre périmètre). */
export function modulesForRole(roleKey: string): ModuleEntry[] {
  const role = getRole(roleKey);
  if (!role || role.teams === 'all') return MODULES;
  const set = new Set(role.teams);
  return MODULES.filter((m) => set.has(m.team));
}

export function teamsForRole(roleKey: string): TeamKey[] {
  const role = getRole(roleKey);
  if (!role) return [];
  return role.teams === 'all' ? (Object.keys(TEAMS) as TeamKey[]) : role.teams;
}

export function getModule(key: string): ModuleEntry | undefined {
  return MODULES.find((m) => m.key === key);
}

/** Liste des arêtes (dépendances) du graphe : from dépend de to. */
export function edges(): Array<{ from: string; to: string }> {
  const out: Array<{ from: string; to: string }> = [];
  MODULES.forEach((m) => m.deps.forEach((to) => { if (getModule(to)) out.push({ from: m.key, to }); }));
  return out;
}

export function modulesByTeam(): Array<{ team: TeamKey; mods: ModuleEntry[] }> {
  return (Object.keys(TEAMS) as TeamKey[])
    .map((team) => ({ team, mods: MODULES.filter((m) => m.team === team) }))
    .filter((g) => g.mods.length > 0);
}

export function statusCounts(): Record<ModStatus, number> {
  const c: Record<ModStatus, number> = { ok: 0, partial: 0, dev: 0, error: 0, off: 0 };
  MODULES.forEach((m) => (c[m.status] += 1));
  return c;
}
