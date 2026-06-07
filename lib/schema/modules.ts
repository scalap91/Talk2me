/**
 * Talk2Me — Boussole technique (schema modules).
 *
 * Doctrine [[airbizness-schema-technique]] appliquée à Talk2Me :
 *   - Page /schema = miroir du code
 *   - 1 module = 1 contrat clair (entrées/sorties/responsabilité)
 *   - Dépendances explicites (depends_on) — used_by calculé automatiquement
 *   - Statut visible (stable / wip / todo / deprecated)
 *
 * Le manifeste est MANUEL pour le MVP (un parseur AST viendra plus tard).
 * À mettre à jour à chaque grosse feature.
 */

export type ModuleStatus = 'stable' | 'wip' | 'todo' | 'deprecated';
export type ModuleCategory =
  | 'auth'
  | 'social'
  | 'chat'
  | 'ia'
  | 'tools'
  | 'cards'
  | 'call'
  | 'feed'
  | 'infra';

export interface ModuleSpec {
  id: string;
  name: string;
  category: ModuleCategory;
  status: ModuleStatus;
  description: string;
  responsibility: string;
  files: string[];
  api_endpoints?: string[];
  db_tables?: string[];
  depends_on?: string[];
  doctrine_refs?: string[];
  last_updated?: string;
}

export const CATEGORY_LABELS: Record<ModuleCategory, string> = {
  auth: 'Auth & user',
  social: 'Social',
  chat: 'Chat',
  ia: 'IA',
  tools: 'Tools IA',
  cards: 'Cards',
  call: 'Call',
  feed: 'Feed',
  infra: 'Infra',
};

export const STATUS_LABELS: Record<ModuleStatus, string> = {
  stable: 'Stable',
  wip: 'WIP',
  todo: 'À faire',
  deprecated: 'Déprécié',
};

export const STATUS_DOTS: Record<ModuleStatus, string> = {
  stable: 'bg-emerald-400',
  wip: 'bg-amber-400',
  todo: 'bg-sky-400',
  deprecated: 'bg-red-400',
};

export const MODULES: ModuleSpec[] = [
  // ─── Auth & user ───────────────────────────────────────────────────────
  {
    id: 'auth-magic-link',
    name: 'Auth Magic Link',
    category: 'auth',
    status: 'stable',
    description:
      'Authentification passwordless par email : un token signé de 15 min est envoyé par mail, sa validation ouvre une session cookie HttpOnly.',
    responsibility:
      'Créer / identifier un user via email, ouvrir et fermer les sessions.',
    files: [
      'lib/auth.ts',
      'lib/auth-constants.ts',
      'lib/mailer.ts',
      'lib/db.ts',
      'app/api/auth/magic-link/request/route.ts',
      'app/api/auth/magic-link/verify/[token]/route.ts',
      'app/api/auth/me/route.ts',
      'app/api/auth/signout/route.ts',
      'app/signin/page.tsx',
      'middleware.ts',
    ],
    api_endpoints: [
      'POST /api/auth/magic-link/request',
      'GET  /api/auth/magic-link/verify/[token]',
      'GET  /api/auth/me',
      'POST /api/auth/signout',
    ],
    db_tables: ['users', 'sessions', 'magic_links'],
    doctrine_refs: ['talk2me-rename', 'feedback_talktome_multi_user_temps_reel'],
  },
  {
    id: 'user-profile',
    name: 'Profil utilisateur',
    category: 'auth',
    status: 'stable',
    description:
      'Profil user : display_name, username, avatar humain, IA personnelle (ai_name, ai_gender, ai_avatar_url). Talk2Me ID public à partager pour ajout en ami.',
    responsibility:
      'Stocker et exposer les attributs identitaires user + paramètres IA personnelle.',
    files: [
      'app/profile/page.tsx',
      'app/api/users/[username]/route.ts',
      'app/api/users/me/avatar/route.ts',
      'app/api/users/me/ai-name/route.ts',
      'app/api/users/me/ai-gender/route.ts',
      'app/api/users/me/ai-avatar/route.ts',
      'lib/avatar.ts',
    ],
    api_endpoints: [
      'GET  /api/users/[username]',
      'POST /api/users/me/avatar',
      'POST /api/users/me/ai-name',
      'POST /api/users/me/ai-gender',
      'POST /api/users/me/ai-avatar',
    ],
    db_tables: ['users'],
    depends_on: ['auth-magic-link', 'upload-static'],
  },
  {
    id: 'ai-memories',
    name: 'Mémoires IA',
    category: 'auth',
    status: 'stable',
    description:
      'Mémoires persistantes injectées dans le system prompt de l\'IA personnelle. Liste consultable et éditable par l\'user.',
    responsibility:
      'Stocker les "souvenirs" stables (préférences, habitudes) du user pour l\'IA.',
    files: [
      'app/api/users/me/memories/route.ts',
      'lib/db.ts',
    ],
    api_endpoints: [
      'GET    /api/users/me/memories',
      'POST   /api/users/me/memories',
      'DELETE /api/users/me/memories',
    ],
    db_tables: ['ai_memories'],
    depends_on: ['auth-magic-link', 'ia-personnelle'],
  },

  // ─── Social ────────────────────────────────────────────────────────────
  {
    id: 'friends-graph',
    name: 'Graphe d\'amis',
    category: 'social',
    status: 'stable',
    description:
      'Liens d\'amitié bidirectionnels : recherche par Talk2Me ID ou username, ajout, suppression, listing. Pas de demande pending (ajout direct, suppression silencieuse).',
    responsibility:
      'Gérer le graphe d\'amis (add/remove/search/list).',
    files: [
      'app/friends/page.tsx',
      'app/friends/add/page.tsx',
      'app/api/friends/add/route.ts',
      'app/api/friends/remove/route.ts',
      'app/api/friends/search/route.ts',
      'app/api/friends/list/route.ts',
    ],
    api_endpoints: [
      'POST /api/friends/add',
      'POST /api/friends/remove',
      'GET  /api/friends/search?q=',
      'GET  /api/friends/list',
    ],
    db_tables: ['friendships', 'users'],
    depends_on: ['auth-magic-link', 'user-profile'],
  },
  {
    id: 'contact-card',
    name: 'Contact Card',
    category: 'social',
    status: 'stable',
    description:
      'Carte contact Talk2Me partageable (avatar, nom, Talk2Me ID, statut ami / self).',
    responsibility:
      'Rendre une fiche contact uniforme dans /profile, /u/[username] et recherche amis.',
    files: [
      'components/contact/Talk2MeContactCard.tsx',
      'app/u/[username]/page.tsx',
    ],
    depends_on: ['user-profile'],
  },
  {
    id: 'presence-sse',
    name: 'Présence (SSE)',
    category: 'social',
    status: 'stable',
    description:
      'Présence "online / typing / last_seen" diffusée en Server-Sent Events. Heartbeat client toutes les N secondes.',
    responsibility:
      'Diffuser l\'état présent des amis en temps réel.',
    files: [
      'app/api/presence/heartbeat/route.ts',
      'app/api/presence/events/route.ts',
      'components/presence/PresenceHeartbeat.tsx',
      'lib/realtime-bus.ts',
    ],
    api_endpoints: [
      'POST /api/presence/heartbeat',
      'GET  /api/presence/events  (SSE)',
    ],
    db_tables: ['presence'],
    depends_on: ['auth-magic-link', 'realtime-bus'],
  },

  // ─── Chat ──────────────────────────────────────────────────────────────
  {
    id: 'chat-solo',
    name: 'Chat solo (legacy /)',
    category: 'chat',
    status: 'stable',
    description:
      'Conversation 1-to-1 avec l\'IA personnelle de l\'user (route racine /). Persistée côté DB en conversation kind="agent".',
    responsibility:
      'Offrir le canal direct user ↔ son IA personnelle.',
    files: [
      'app/page.tsx',
      'app/api/chat/route.ts',
      'app/api/conversation/route.ts',
      'lib/store/chat.ts',
    ],
    api_endpoints: [
      'POST /api/chat',
      'GET  /api/conversation',
    ],
    db_tables: ['conversations', 'messages'],
    depends_on: ['auth-magic-link', 'ia-personnelle', 'card-renderer'],
  },
  {
    id: 'conv-p2p',
    name: 'Conversations P2P',
    category: 'chat',
    status: 'stable',
    description:
      'Conversations 1-to-1 entre deux users humains (route /c/[conv_id] et /messages pour la liste). Lecture/marquage lus, ouverture via création P2P.',
    responsibility:
      'Gérer les conversations directes entre humains (création, lecture, marquage).',
    files: [
      'app/c/[conv_id]/page.tsx',
      'app/messages/page.tsx',
      'app/api/conversations/list/route.ts',
      'app/api/conversations/create-p2p/route.ts',
      'app/api/conversations/[id]/route.ts',
      'app/api/conversations/[id]/messages/route.ts',
      'app/api/conversations/[id]/read/route.ts',
    ],
    api_endpoints: [
      'GET  /api/conversations/list',
      'POST /api/conversations/create-p2p',
      'GET  /api/conversations/[id]',
      'GET  /api/conversations/[id]/messages',
      'POST /api/conversations/[id]/read',
    ],
    db_tables: ['conversations', 'conversation_participants', 'messages'],
    depends_on: ['auth-magic-link', 'friends-graph', 'messages-realtime'],
  },
  {
    id: 'messages-realtime',
    name: 'Messages temps réel (SSE)',
    category: 'chat',
    status: 'stable',
    description:
      'Diffusion SSE par conversation : nouveaux messages, accusés de lecture, edit/delete. Auth via cookie, filtrage participant.',
    responsibility:
      'Pousser au navigateur tout événement message d\'une conversation.',
    files: [
      'app/api/conversations/[id]/events/route.ts',
      'lib/realtime-bus.ts',
      'components/chat/ChatStream.tsx',
    ],
    api_endpoints: [
      'GET /api/conversations/[id]/events  (SSE)',
    ],
    depends_on: ['conv-p2p', 'realtime-bus'],
  },
  {
    id: 'swipe-right-reply',
    name: 'Swipe right (réponse contextuelle)',
    category: 'chat',
    status: 'stable',
    description:
      'Swipe à droite sur une bulle pour répondre en citation (pattern WhatsApp). Composant MessageBubble + ChatInput coordonnent l\'aperçu de réponse.',
    responsibility:
      'Permettre la réponse contextuelle sur une bulle existante.',
    files: [
      'components/chat/MessageBubble.tsx',
      'components/chat/ChatInput.tsx',
      'components/chat/ChatStream.tsx',
    ],
    depends_on: ['conv-p2p'],
  },

  // ─── IA ────────────────────────────────────────────────────────────────
  {
    id: 'ia-personnelle',
    name: 'IA personnelle',
    category: 'ia',
    status: 'stable',
    description:
      'L\'agent IA propre à chaque user : nom, genre, avatar et mémoires injectés dans le system prompt à chaque appel /api/chat. Modèle DeepSeek via SDK OpenAI.',
    responsibility:
      'Tenir un agent IA personnel cohérent : identité + mémoire + style.',
    files: [
      'app/api/chat/route.ts',
      'lib/db.ts',
    ],
    api_endpoints: [
      'POST /api/chat',
    ],
    db_tables: ['users', 'ai_memories', 'messages'],
    depends_on: ['user-profile', 'ai-memories', 'ia-toolkit', 'ia-raisonnement'],
  },
  {
    id: 'ia-toolkit',
    name: 'Toolkit IA (function calling)',
    category: 'ia',
    status: 'stable',
    description:
      'Registry des tools exposés à l\'IA (format OpenAI). L\'IA reçoit le schéma + tool_choice:"auto" et décide quels handlers appeler en parallèle.',
    responsibility:
      'Exposer un set d\'outils typés (search/fetch/render) à l\'IA et router vers les handlers.',
    files: [
      'lib/tools/index.ts',
      'lib/tools/handlers.ts',
    ],
    depends_on: [
      'tool-youtube',
      'tool-place',
      'tool-recipe',
      'tool-wikipedia',
      'tool-weather',
      'tool-product',
      'tool-web-search',
      'tool-fetch-url',
    ],
    doctrine_refs: ['talktome-toolkit-ia'],
  },
  {
    id: 'ia-mode-editor',
    name: 'Mode éditeur de carte',
    category: 'ia',
    status: 'stable',
    description:
      'Mode édition de carte (image / vidéo / texte) : l\'IA aide à reformuler, recadrer, ajouter des overlays. Endpoints dédiés pour ne pas polluer le chat principal.',
    responsibility:
      'Piloter une carte en cours d\'édition via prompts IA dédiés.',
    files: [
      'app/api/cards/editor/chat/route.ts',
      'app/api/cards/editor/apply-video-ops/route.ts',
      'app/api/cards/editor/generate-metadata/route.ts',
      'components/cards/editors/CardAIPanel.tsx',
    ],
    api_endpoints: [
      'POST /api/cards/editor/chat',
      'POST /api/cards/editor/apply-video-ops',
      'POST /api/cards/editor/generate-metadata',
    ],
    depends_on: ['ia-personnelle', 'card-renderer'],
  },
  {
    id: 'ia-raisonnement',
    name: 'Pipeline raisonnement silencieux',
    category: 'ia',
    status: 'stable',
    description:
      'Étapes invisibles imposées via le system prompt : analyse de la phrase entière, consultation mémoire/contexte, niveau de confiance, choix tool ou question. Aucune fuite vers l\'user.',
    responsibility:
      'Imposer un protocole de raisonnement avant toute réponse / appel tool.',
    files: [
      'app/api/chat/route.ts',
    ],
    depends_on: ['ia-personnelle'],
    doctrine_refs: ['talktome-no-excuses', 'talktome-cards-primaute'],
  },

  // ─── Tools IA ──────────────────────────────────────────────────────────
  {
    id: 'tool-youtube',
    name: 'Tool · YouTube',
    category: 'tools',
    status: 'stable',
    description:
      'Cherche une vraie vidéo YouTube et retourne (video_id, title, channel, thumbnail) pour rendre un YouTubeEmbed officiel.',
    responsibility:
      'Trouver une vidéo réelle correspondant à une intention user.',
    files: [
      'lib/youtube-search.ts',
      'lib/tools/handlers.ts',
      'app/api/search/youtube/route.ts',
    ],
    api_endpoints: ['GET /api/search/youtube'],
    depends_on: ['ia-toolkit'],
  },
  {
    id: 'tool-place',
    name: 'Tool · Lieux (OSM)',
    category: 'tools',
    status: 'stable',
    description:
      'Recherche de lieux réels (restos, cafés, pharmacies…) via Nominatim + Overpass OpenStreetMap. Filtres amenity + ville ou géoloc.',
    responsibility:
      'Trouver de vrais lieux géolocalisés depuis OSM.',
    files: [
      'lib/tools/handlers.ts',
      'app/api/search/place/route.ts',
      'app/api/geocode/route.ts',
      'app/api/messages/[id]/places/route.ts',
    ],
    api_endpoints: [
      'GET /api/search/place',
      'GET /api/geocode',
      'GET /api/messages/[id]/places',
    ],
    depends_on: ['ia-toolkit'],
  },
  {
    id: 'tool-recipe',
    name: 'Tool · Recettes',
    category: 'tools',
    status: 'stable',
    description:
      'Scrape Marmiton (ou équivalent) pour récupérer une recette concrète (titre, ingrédients, étapes, photo).',
    responsibility:
      'Retourner une recette réelle exploitable.',
    files: [
      'lib/recipe-search.ts',
      'lib/tools/handlers.ts',
      'app/api/search/recipe/route.ts',
    ],
    api_endpoints: ['GET /api/search/recipe'],
    depends_on: ['ia-toolkit'],
  },
  {
    id: 'tool-wikipedia',
    name: 'Tool · Wikipédia',
    category: 'tools',
    status: 'stable',
    description:
      'Cherche un article Wikipédia (FR puis EN fallback) et renvoie résumé + image + URL pour rendu WikipediaCard.',
    responsibility:
      'Obtenir une fiche encyclopédique sourcée.',
    files: [
      'lib/wikipedia-search.ts',
      'lib/tools/handlers.ts',
    ],
    depends_on: ['ia-toolkit'],
  },
  {
    id: 'tool-weather',
    name: 'Tool · Météo',
    category: 'tools',
    status: 'stable',
    description:
      'Prévisions Open-Meteo (gratuit, sans clé) : geocodage ville → forecast horaire + journalier.',
    responsibility:
      'Donner la météo réelle d\'un lieu.',
    files: [
      'lib/weather.ts',
      'lib/tools/handlers.ts',
    ],
    depends_on: ['ia-toolkit'],
  },
  {
    id: 'tool-product',
    name: 'Tool · Produits',
    category: 'tools',
    status: 'stable',
    description:
      'Recherche shopping (Bing Shopping / scrape) avec prix, image, marchand, lien.',
    responsibility:
      'Retourner de vrais produits achetables.',
    files: [
      'lib/product-search.ts',
      'lib/tools/handlers.ts',
      'app/api/search/product/route.ts',
    ],
    api_endpoints: ['GET /api/search/product'],
    depends_on: ['ia-toolkit'],
  },
  {
    id: 'tool-web-search',
    name: 'Tool · Recherche web',
    category: 'tools',
    status: 'stable',
    description:
      'Recherche web généraliste (Bing puis DuckDuckGo en fallback). Liste de résultats (titre, URL, snippet).',
    responsibility:
      'Trouver des sources web pour les sujets non couverts par les tools spécialisés.',
    files: [
      'lib/web-search.ts',
      'lib/tools/handlers.ts',
    ],
    depends_on: ['ia-toolkit'],
  },
  {
    id: 'tool-fetch-url',
    name: 'Tool · Fetch URL',
    category: 'tools',
    status: 'stable',
    description:
      'Récupération HTML d\'une URL (fetch direct, fallback Playwright headless en dernier recours). Parse cheerio + parsing OpenGraph.',
    responsibility:
      'Aller lire une page web ciblée quand aucun tool spécialisé ne convient.',
    files: [
      'lib/playwright-fetch.ts',
      'lib/url-parser.ts',
      'lib/tools/handlers.ts',
      'app/api/og/route.ts',
      'app/api/enrich/photo/route.ts',
    ],
    api_endpoints: [
      'GET /api/og',
      'GET /api/enrich/photo',
    ],
    depends_on: ['ia-toolkit'],
  },

  // ─── Cards ─────────────────────────────────────────────────────────────
  {
    id: 'card-renderer',
    name: 'Card renderer (générique)',
    category: 'cards',
    status: 'stable',
    description:
      'Renderer générique d\'embed/cards dans le flux chat : route selon le type (youtube, place, recipe, wikipedia, weather, product, search, article, image, video, pdf, spotify, tiktok, twitter, maps).',
    responsibility:
      'Choisir et monter le bon composant carte selon le type renvoyé par l\'IA / tool.',
    files: [
      'components/chat/EmbedRenderer.tsx',
      'lib/chat-types.ts',
    ],
    depends_on: [
      'card-image',
      'card-video',
      'card-texte',
      'card-youtube',
      'card-place',
      'card-recipe',
      'card-wikipedia',
      'card-weather',
      'card-product',
      'card-search-result',
    ],
  },
  {
    id: 'card-image',
    name: 'Card image (display + éditeur)',
    category: 'cards',
    status: 'stable',
    description:
      'Affichage image + éditeur (canvas) : crop, overlays texte, filtres. Modal éditeur partagé.',
    responsibility:
      'Présenter et éditer une image carte.',
    files: [
      'components/feed/ImageCardDisplay.tsx',
      'components/cards/editors/ImageCardEditor.tsx',
      'components/embeds/ImageEmbed.tsx',
    ],
    depends_on: ['card-renderer', 'upload-static'],
  },
  {
    id: 'card-video',
    name: 'Card vidéo (display + éditeur ffmpeg)',
    category: 'cards',
    status: 'stable',
    description:
      'Affichage vidéo + éditeur (timeline, overlay texte, opérations ffmpeg côté serveur).',
    responsibility:
      'Présenter et éditer une vidéo carte.',
    files: [
      'components/feed/VideoCardDisplay.tsx',
      'components/cards/editors/VideoCardEditor.tsx',
      'components/cards/editors/VideoTimeline.tsx',
      'components/cards/editors/VideoTextOverlay.tsx',
      'lib/ffmpeg-helpers.ts',
    ],
    depends_on: ['card-renderer', 'upload-static', 'ia-mode-editor'],
  },
  {
    id: 'card-texte',
    name: 'Card texte (display + éditeur)',
    category: 'cards',
    status: 'stable',
    description:
      'Carte texte (titre + corps + style). Éditeur simple avec assistance IA.',
    responsibility:
      'Présenter et éditer une carte texte.',
    files: [
      'components/feed/TexteCardDisplay.tsx',
      'components/cards/editors/TexteCardEditor.tsx',
    ],
    depends_on: ['card-renderer', 'ia-mode-editor'],
  },
  {
    id: 'card-youtube',
    name: 'Card YouTube',
    category: 'cards',
    status: 'stable',
    description: 'Embed iframe officiel YouTube (privacy mode).',
    responsibility: 'Rendre une vidéo YouTube en carte.',
    files: ['components/embeds/YouTubeEmbed.tsx'],
    depends_on: ['card-renderer', 'tool-youtube'],
  },
  {
    id: 'card-place',
    name: 'Card lieu (OSM)',
    category: 'cards',
    status: 'stable',
    description: 'Carte d\'un lieu : nom, type, adresse, distance, horaires, mini-map.',
    responsibility: 'Afficher un lieu réel.',
    files: ['components/cards/PlaceCard.tsx', 'components/embeds/MapsEmbed.tsx'],
    depends_on: ['card-renderer', 'tool-place'],
  },
  {
    id: 'card-recipe',
    name: 'Card recette',
    category: 'cards',
    status: 'stable',
    description: 'Carte recette : photo, titre, ingrédients pliables, étapes, lien source.',
    responsibility: 'Afficher une recette.',
    files: ['components/cards/RecipeCard.tsx'],
    depends_on: ['card-renderer', 'tool-recipe'],
  },
  {
    id: 'card-wikipedia',
    name: 'Card Wikipédia',
    category: 'cards',
    status: 'stable',
    description: 'Fiche Wikipédia : photo, résumé, langue, lien.',
    responsibility: 'Afficher un article encyclopédique.',
    files: ['components/cards/WikipediaCard.tsx'],
    depends_on: ['card-renderer', 'tool-wikipedia'],
  },
  {
    id: 'card-weather',
    name: 'Card météo',
    category: 'cards',
    status: 'stable',
    description: 'Météo lieu : conditions actuelles + prévisions horaires/jour.',
    responsibility: 'Afficher une prévision météo.',
    files: ['components/cards/WeatherCard.tsx'],
    depends_on: ['card-renderer', 'tool-weather'],
  },
  {
    id: 'card-product',
    name: 'Card produit',
    category: 'cards',
    status: 'stable',
    description: 'Produit shopping : photo, prix, marchand, lien achat.',
    responsibility: 'Afficher un produit.',
    files: ['components/cards/ProductCard.tsx'],
    depends_on: ['card-renderer', 'tool-product'],
  },
  {
    id: 'card-search-result',
    name: 'Card résultat de recherche',
    category: 'cards',
    status: 'stable',
    description: 'Carte résultat web brut (titre, URL, snippet, favicon).',
    responsibility: 'Afficher un résultat de recherche web.',
    files: ['components/cards/SearchResultCard.tsx'],
    depends_on: ['card-renderer', 'tool-web-search'],
  },

  // ─── Call ──────────────────────────────────────────────────────────────
  {
    id: 'webrtc-call',
    name: 'Appel WebRTC (audio + vidéo)',
    category: 'call',
    status: 'stable',
    description:
      'Appel 1-to-1 audio/vidéo via WebRTC : signaling SSE (offer/answer/ICE), modal d\'appel minimisable.',
    responsibility:
      'Établir et tenir un appel temps réel entre 2 users.',
    files: [
      'components/call/CallModal.tsx',
      'components/call/CallButtons.tsx',
      'lib/webrtc-helpers.ts',
      'app/api/call/[conv_id]/offer/route.ts',
      'app/api/call/[conv_id]/answer/route.ts',
      'app/api/call/[conv_id]/ice/route.ts',
      'app/api/call/[conv_id]/end/route.ts',
    ],
    api_endpoints: [
      'POST /api/call/[conv_id]/offer',
      'POST /api/call/[conv_id]/answer',
      'POST /api/call/[conv_id]/ice',
      'POST /api/call/[conv_id]/end',
    ],
    depends_on: ['conv-p2p', 'realtime-bus'],
  },
  {
    id: 'activity-sync',
    name: 'Activité synchronisée (watch together)',
    category: 'call',
    status: 'wip',
    description:
      'Activité partagée greffée à un appel : Watch Together vidéo synchronisé, picker d\'activités, sync de l\'état.',
    responsibility:
      'Faire vivre une activité commune (vidéo / jeu / autre) pendant un appel.',
    files: [
      'components/activity/ActivityPicker.tsx',
      'components/activity/ActivityVideoSync.tsx',
      'components/activity/VideoPicker.tsx',
      'lib/activity-types.ts',
      'app/api/activities/start/route.ts',
      'app/api/activities/active/route.ts',
      'app/api/activities/[id]/state/route.ts',
      'app/api/activities/[id]/end/route.ts',
    ],
    api_endpoints: [
      'POST /api/activities/start',
      'GET  /api/activities/active',
      'POST /api/activities/[id]/state',
      'POST /api/activities/[id]/end',
    ],
    db_tables: ['activities'],
    depends_on: ['webrtc-call'],
  },

  // ─── Feed ──────────────────────────────────────────────────────────────
  {
    id: 'feed-home',
    name: 'Feed /home',
    category: 'feed',
    status: 'stable',
    description:
      'Flux d\'accueil : posts publiés depuis conversations + cards directes (image/vidéo/texte). Tri chronologique.',
    responsibility:
      'Afficher le fil des publications de l\'user et de ses amis.',
    files: [
      'app/home/page.tsx',
      'app/api/posts/route.ts',
    ],
    api_endpoints: [
      'GET  /api/posts',
      'POST /api/posts',
    ],
    db_tables: ['posts', 'direct_cards', 'messages'],
    depends_on: ['post-publication', 'card-renderer', 'direct-cards-feed'],
  },
  {
    id: 'post-card',
    name: 'PostCard (clip conversationnel)',
    category: 'feed',
    status: 'stable',
    description:
      'Carte de post : extrait d\'une conversation publié comme "clip" (slides de bulles + IA), réutilise le card-renderer.',
    responsibility:
      'Présenter un post = morceau de conversation sélectionné.',
    files: [
      'components/feed/PostCard.tsx',
    ],
    depends_on: ['feed-home', 'card-renderer'],
  },
  {
    id: 'post-publication',
    name: 'Publication d\'un post',
    category: 'feed',
    status: 'stable',
    description:
      'Workflow : sélection contiguë de bulles dans la conv → bouton "Publier" → API /posts → apparaît dans /home.',
    responsibility:
      'Transformer une sélection de bulles en post public.',
    files: [
      'components/chat/SelectionFAB.tsx',
      'app/api/posts/route.ts',
    ],
    api_endpoints: ['POST /api/posts'],
    db_tables: ['posts'],
    depends_on: ['conv-p2p', 'chat-solo'],
  },
  {
    id: 'direct-cards-feed',
    name: 'Cards directes (Image/Vidéo/Texte)',
    category: 'feed',
    status: 'stable',
    description:
      'Création directe d\'une carte (sans passer par une conv) : upload média, éditeur, publication dans le feed.',
    responsibility:
      'Permettre de publier une carte standalone dans le feed.',
    files: [
      'app/api/cards/create/route.ts',
      'components/feed/ImageCardDisplay.tsx',
      'components/feed/VideoCardDisplay.tsx',
      'components/feed/TexteCardDisplay.tsx',
    ],
    api_endpoints: ['POST /api/cards/create'],
    db_tables: ['direct_cards'],
    depends_on: ['card-image', 'card-video', 'card-texte', 'upload-static'],
  },

  // ─── Infra ─────────────────────────────────────────────────────────────
  {
    id: 'pwa',
    name: 'PWA (manifest + service worker)',
    category: 'infra',
    status: 'stable',
    description:
      'Progressive Web App : manifest.json, sw.js (cache shell), installation iOS/Android. Composant ServiceWorkerRegister monté à la racine.',
    responsibility:
      'Rendre Talk2Me installable et utilisable en mode app.',
    files: [
      'public/manifest.json',
      'public/sw.js',
      'public/icons',
      'components/chat/ServiceWorkerRegister.tsx',
      'app/layout.tsx',
    ],
  },
  {
    id: 'nginx-ssl',
    name: 'Nginx + SSL talk2me.fr',
    category: 'infra',
    status: 'stable',
    description:
      'Reverse proxy Nginx → Next.js (port local), certificat Let\'s Encrypt sur talk2me.fr. Sert /uploads statique et passe le reste à l\'app.',
    responsibility:
      'Exposer Talk2Me sur Internet en HTTPS.',
    files: [
      '/etc/nginx/sites-available/talk2me.fr',
    ],
    depends_on: ['upload-static'],
  },
  {
    id: 'upload-static',
    name: 'Upload & statique /uploads',
    category: 'infra',
    status: 'stable',
    description:
      'Endpoint d\'upload (multipart), stockage disque sous public/uploads, service statique par Nginx + Next.',
    responsibility:
      'Recevoir et servir les médias users (avatars, photos, vidéos).',
    files: [
      'app/api/upload/route.ts',
      'public/uploads',
      'app/uploads',
    ],
    api_endpoints: ['POST /api/upload'],
    depends_on: ['auth-magic-link'],
  },
  {
    id: 'realtime-bus',
    name: 'Bus temps réel (in-process)',
    category: 'infra',
    status: 'stable',
    description:
      'Bus pub/sub en mémoire qui pousse vers les flux SSE (présence, messages, signaling appel, activité). Single-process, à remplacer par Redis si scale-out.',
    responsibility:
      'Fan-out interne des événements vers les abonnés SSE.',
    files: [
      'lib/realtime-bus.ts',
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────

export function getModule(id: string): ModuleSpec | undefined {
  return MODULES.find((m) => m.id === id);
}

export function getModuleUsedBy(id: string): string[] {
  return MODULES.filter((m) => m.depends_on?.includes(id)).map((m) => m.id);
}

export function countByCategory(): Record<ModuleCategory, number> {
  const acc = {} as Record<ModuleCategory, number>;
  for (const c of Object.keys(CATEGORY_LABELS) as ModuleCategory[]) acc[c] = 0;
  for (const m of MODULES) acc[m.category]++;
  return acc;
}

export function countByStatus(): Record<ModuleStatus, number> {
  const acc: Record<ModuleStatus, number> = {
    stable: 0,
    wip: 0,
    todo: 0,
    deprecated: 0,
  };
  for (const m of MODULES) acc[m.status]++;
  return acc;
}
