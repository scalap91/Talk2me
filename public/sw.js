// Service worker Talk2Me v44 - cache statique léger (root paths)
// v44 (2026-06-05, Pascal) : #421 Éditeur VideoCard multi-clips TikTok/CapCut.
//   - Refacto card-draft-store : ARRAY de VideoClip[] (id/source_url/trim/
//     filter/duration). Backward compat via ensureClipsCompat() : draft hérité
//     1-clip (source_url+trim) → interprété comme clips:[{...}].
//   - Nouveau composant CameraCaptureModal : MediaRecorder + countdown
//     3/5/10s, switch front/back, pause/stop, upload auto.
//   - Nouveau composant VideoClipsTimeline : mini-thumbs + drag&drop reorder
//     + bouton Ajouter + cycle transition cut↔fade entre clips.
//   - Nouveau composant VideoFiltersTab : 12 presets couleur/style (CSS live
//     preview + ffmpeg burn-in). Applique au clip sélectionné OU à tous.
//   - Nouveau lib/video-filters.ts : presets none/bw/sepia/vintage/cold/warm/
//     dramatic/vivid/faded/lomo/cinema/night avec couples CSS+ffmpeg.
//   - Refacto lib/ffmpeg-helpers : nouvelle fonction concatClips() avec
//     normalisation (scale 720x1280 / fps 30 / aac 48k) + transitions cut
//     (concat demuxer) ou fade (xfade filter_complex + acrossfade audio).
//   - /api/cards/editor/apply-video-ops étendu pour accepter ops.clips[] +
//     ops.transitions[]. Mode legacy 1-clip préservé.
//   - Galerie : input file pour importer une vidéo existante comme clip.
// v43 (2026-06-05, Pascal) : #420 Bande son éditeur VideoCard.
//   - Nouvelle bibliothèque /public/audio-lib/ (30 pistes CC0 — chill,
//     energetic, dramatic, lofi, ambient — générées procéduralement
//     ffmpeg, 96 kbps mono 22 kHz, ~42 Mo total).
//   - UI éditeur étendue avec onglet 🎵 Musique (lib + upload) + sliders
//     mixage (volume vidéo / volume musique / offset).
//   - Backend ffmpeg `mixAudioOnVideo` ajouté dans lib/ffmpeg-helpers,
//     orchestré via /api/cards/editor/apply-video-ops au publish ET
//     /api/cards/editor/add-audio pour preview avant Apply.
//   - Page transparence /credits/audio liste sources + licences.
//   - card-draft-store reçoit champ `audio: VideoAudio | null` (#420).
// v42 (2026-06-05, Pascal) : #419 Refacto UI jeux Échecs/Dames — le plateau
//   ne s'ouvre plus en modal plein écran (GameBoardModal supprimé) mais en
//   dock inline sticky bottom intégré DANS la conv (InlineGameDock). Les
//   messages scrollent au-dessus du dock, le composer reste accessible :
//   "ça permet de toujours discuter avec le gas". ConversationView a une
//   nouvelle prop bottomSlot pour ce pattern réutilisable.
// v41 (2026-06-05, Pascal) : précédent (v40 base).
// v40 (2026-06-05, Pascal) : #413 Universal Embed Hub fixes (audit cards).
//   - SERVER_CACHE adaptatif : fallback TTL 30s, sources fragiles
//     (reddit/twitter/spotify) TTL 1min, succès normaux 5min. Bug #1 cache
//     empoisonnait les fallbacks transitoires 5 min.
//   - Twitch parent= hostname public (env NEXT_PUBLIC_APP_DOMAIN ou
//     x-forwarded-host nginx, pas baseUrl interne). Bug #2 écran noir prod.
//   - LinkedIn n'invente plus d'URN depuis chiffres slug ; sans URN
//     explicite, enrichit via OG (titre + thumb) au lieu d'iframe 404.
//   - Spotify ID validé regex [A-Za-z0-9]{22} ; ID invalide → fallback
//     immédiat sans oEmbed (timeout 2s max). Bug #6 bloquait 5s.
//   - Image extractor natif (.jpg/.png/.webp/.gif/.avif/.svg + CDN hosts).
//     UnifiedCardRenderer rend <img> direct pour kind=image. Bug #5.
//   - Facebook : link-out only avec OG enrichi (iframe plugin inutilisable
//     sans setup FB Developer). Bug #3.
//   - Fullscreen-feed + audio : iframe contained max-h-90% center, plus
//     stretch 100% (Spotify/Deezer/SoundCloud/Apple). Bug #10.
//   - Polish : Vimeo/Loom/Apple OG enrichi, Deezer oEmbed officiel, Reddit
//     UA Mozilla complet, Twitter OG fallback si oEmbed KO.
// v39 (2026-06-05, Pascal) : #414 Léa quality fixes (markdown leak / nom user
//   leak / annonces recherche). Doctrine [[feedback-modular-no-scattered-
//   patches]] : prompt-builder contextuel + scrubbers renforcés branchés
//   dans /api/chat (solo) ET /api/conversations/[id]/messages (P2P) ET
//   /lib/ai/officiel/handler. Bug #1 fuzz novice : "**T2M de Fuz**" /
//   "- **Discuter**" → texte plat. Bug #2 : "Je suis T2M de PascalRepir"
//   → "Je suis ton IA". Bug #3 : "Je te cherche ça tout de suite" sans
//   tool call → supprimé. 3/5 patches AI Ops approuvés + appliqués sous
//   forme équivalente. Mesure fuzz novice avant : 50% pass / 5 markdown
//   leak / 4 forbidden_pattern. Cible : ≥80% pass.
// v38 (2026-06-05, Pascal) : #409 Feature Registry & Regression Test Suite.
//   - Nouvelles pages : /schema/features, /schema/features/[id]
//   - Tables DB : feature_registry, feature_test_runs, feature_test_results
//   - PM2 process feature-cron (run horaire complet)
//   - CLI : npm run features:check / list / add / drift / cron
//   - Aboie Telegram sur RÉGRESSION (feature live qui casse).
//   - 30+ features backfillées (pages, API, embed extractors, infra, DB).
// v37 (2026-06-05, Pascal) : #408b Boussole refonte (vue progression Léa +
//   schéma graphique modules + code source viewer).
//   - /schema : ajout LeaQualityCard (sparkline 7j, score jour vs hier) +
//     ModulesGraph (mermaid, click-to-open par module).
//   - /schema/[id] : ajout SourceViewer (react-syntax-highlighter, onglets
//     par fichier, tronqué 500 lignes, whitelist stricte API).
//   - /schema/ai-ops : nouveau dashboard AI Ops sous la Boussole (verbatim
//     Pascal "LES RESULTAT DOIVENT APARAITRE DANS LA BOUSSOLE"). Courbe
//     trend 30j recharts dual-axis (score / missions / coût). Patch queue
//     inline. Admin-only (AI_OPS_ADMIN_EMAILS).
//   - API publiques : /api/schema/lea-trend + /api/schema/source.
//   - Libs ajoutées : recharts, mermaid, react-syntax-highlighter.
// v36 (2026-06-05, Pascal) : #408 Watch Together consentement + jeux jouables.
//   Phase A : invite_status pending/accepted/declined sur activities. Nouvelle
//   route /api/activities/[id]/accept|decline|sync. WatchInviteBanner overlay.
//   ActivityVideoSync : low-latency event passthrough + time-stretch follower.
//   Doctrine [[talk2me-watch-together-passthrough]] : aucun stream média.
//   Phase B : ChessBoard interactive (chess.js) + /api/chess/* routes.
//   Phase C : DraughtsBoard 10x10 (dame-engine custom FMJD) + /api/dame/* routes.
//   Phase D : Léa joue (Stockfish WASM child process + minimax depth 4 dame).
//   Commentary DeepSeek courte par coup, fallback varié si pas d'API.
//   Tables ajoutées dans lib/db.ts monolithique : chess_games, dame_games.
// v35 (2026-06-05, Pascal) : #406 + #407 AI Ops platform.
//   #406 Red Team Pipeline IA H24 contre Léa : Generator → Léa → Critic →
//   (toutes les N) Fix → patch_queue. 10 cycles/h default (~$30/mois).
//   Daemon scripts/ai-ops-daemon.mjs (PM2 ai-ops-daemon). Bug critical →
//   Telegram immédiat via tg-bridge. AUCUN auto-merge (Pascal verbatim
//   "STRICTEMENT NON"), tout dans patch_queue validée page /admin/patches.
//   #407 Agent perf tracking : registry/missions/scores/perf_daily. Tous
//   les agents IA notés "comme des ouvriers". Judge Agent évalue 4 critères
//   (objective_met/quality/doctrine_respect/side_effects). Dashboard
//   /admin/agents. Fake users isolés ai-ops-fuzz+*@test.com (PII air-gap).
//   Tables monolithique lib/db.ts : agent_registry, agent_missions,
//   agent_scores, agent_perf_daily, patch_queue, ai_ops_bugs.
// v34 (2026-06-05, Pascal) : #405 AI Fuzz Tester (9 profils × 7 validators).
//   Système de test massif d'agents IA testeurs qui simulent des centaines
//   d'utilisateurs avant les vrais users. Profile `limites` sonde le leak
//   PII (doctrine [[talk2me-pii-air-gap]] : Léa doit refuser activement).
//   CLI : npm run fuzz. Dashboard admin : /admin/fuzz. Tables ajoutées dans
//   lib/db.ts monolithique (fuzz_regression, fuzz_run). Rapport markdown
//   auto dans /reports/fuzz/ + INDEX.md (doctrine [[feedback-fuzz-rapport-
//   obligatoire]]). Emails fuzz exclusivement fuzz+*@test.com (blocklist
//   Brevo). Bump SW pour invalider app shell post-déploiement.
// v33 (2026-06-05, Pascal) : #404 fix DURABLE rotation via CSS-rotate hack.
//
//   CAUSE RACINE identifiée (audit Claude) :
//   Les fixes précédents (#396 manifest portrait-primary + viewport
//   userScalable=false + PortraitLock JS) sont des HINTS que Chrome Android
//   et Samsung Browser ignorent largement dans 3 cas :
//
//   1. PWA installée AVANT le passage à portrait-primary : Chrome met en
//      cache l'ancien manifest "any" et le garde JUSQU'À désinstall. Le
//      manifest update via fetch ne ré-applique PAS l'orientation lock à
//      l'install existante. → Pascal a probablement installé la PWA quand
//      le manifest était encore "any" (commentaires SW v8/PortraitLock).
//
//   2. screen.orientation.lock('portrait') exige soit un mode "vraiment
//      standalone" dès le 1er paint, soit un contexte :fullscreen. Sinon
//      throw SecurityError silencieux (try/catch dans PortraitLock = on
//      ne voit même pas l'erreur). En Samsung Browser tab classique →
//      systématiquement refusé.
//
//   3. userScalable=false : ignoré quand "Force enable zoom" actif dans
//      Chrome settings (option accessibilité par défaut chez certains users).
//
//   FIX appliqué :
//   (a) CSS-rotate hack global dans app/globals.css :
//       @media (orientation:landscape) AND (max-width:1000px) AND
//       (pointer:coarse) AND html:not(.allow-landscape) →
//       body { transform: rotate(-90deg); width:100vh; height:100vw; ... }.
//       Le téléphone tourne physiquement mais l'utilisateur voit toujours
//       portrait. Aucun overlay "tourne ton téléphone".
//   (b) Hook useOrientationUnlockOnFullscreen pose .allow-landscape sur
//       <html> à l'entrée fullscreen vidéo → désactive le rotate hack le
//       temps de la lecture paysage. Retire la classe à la sortie.
//   (c) PortraitLock retry sur pageshow + visibilitychange (BFCache).
//   (d) Manifest "id":"/?pwa=v2" + start_url avec query param force Chrome
//       à reconnaître un nouveau manifest et à actualiser l'orientation
//       de l'install existante (sinon Pascal doit désinstaller/réinstaller).
//   (e) Bump CACHE_NAME v29 → v33 (était désynchronisé avec le numéro SW).
//
//   Tests faits :
//    - npm run build pass
//    - curl /manifest.json : id présent, orientation portrait-primary OK
//    - viewport HTML : user-scalable=no, maximum-scale=1 OK
//
//   Limites honnêtes :
//    - Iframes YouTube/Spotify en lecture inline sont rotatées avec le
//      body (limite CSS). Quand l'user passe en fullscreen vidéo via le
//      bouton iframe natif → fullscreenchange déclenche le hook qui pose
//      .allow-landscape → la vidéo paysage native marche.
//    - Si Pascal a installé la PWA il y a longtemps, Chrome PEUT mettre
//      jusqu'à 24h à honorer le nouvel "id" manifest. Désinstall +
//      réinstall propre garanti d'appliquer immédiatement.
// v31 (2026-06-05, Pascal) : #403 SFU mediasoup natif (Watch Together groupe).
//   Verbatim Pascal : "IL SERA NATIF CEST NOTRE PIECE MAITRESSE / JE FAIT EN
//   INTEGRATION IL FAUT QUE CE SOIT DANS T2M / DEMAIN JE CREE UN GROUPE
//   TALK2ME ET ON REGARDE TOUS LE FILM BRO".
//   Modules nouveaux : /lib/sfu/worker.ts (mediasoup Worker singleton lazy),
//   /lib/sfu/rooms.ts (Room par activity_id, peers/transports/producers/
//   consumers), /lib/sfu/auth-helpers.ts, /lib/sfu/client.ts (mediasoup-client
//   wrapper + getMicCamStream anti-écho forcé). 7 routes API /api/sfu/* :
//   join, transport/create, transport/connect, produce, consume,
//   consume/resume, leave, producers (GET). Composant React
//   /components/sfu/SfuRoom.tsx (grille mosaïque jusqu'à 10 peers MVP).
//   Page test /sfu-test/[activity_id]/page.tsx. Codecs router : opus 48kHz
//   stéréo + VP8. Ports UDP RTC 40000-49999 (ufw allow proto udp).
//   Doctrine [[talk2me-watch-together-passthrough]] respectée : SFU ne
//   transporte que mic+cam des participants, JAMAIS vidéo partenaire.
//   Doctrine [[talk2me-audio-anti-echo]] : echoCancellation +
//   noiseSuppression + autoGainControl forcés sur tout getUserMedia.
//   Variable env requise : MEDIASOUP_ANNOUNCED_IP=141.95.7.170 (IP OVH).
//   Worker mediasoup démarré LAZY au premier join (pas au boot Next).
//   WebRTC P2P 1-to-1 existant gardé (doctrine calls-architecture :
//   "1-to-1 P2P direct, groupes SFU"). Bump SW pour invalider app shell.
// v30 (2026-06-05, Pascal) : #404 fix DUR rotation + zoom (JS runtime).
//   Verbatim Pascal énervé : "SA FAIT MILLE FOIS QUE JE TAI DIT QUE LAPLI
//   PIVOTE QUAND JE TOURNE MON ECRAN ET LE ZOOM DEUX DOIGT FONCTIONNE FIX SA".
//   Cause #396 : manifest portrait-primary + viewport userScalable=false sont
//   IGNORÉS par Samsung Browser (pas en PWA strictement installée) et par
//   Chromium si "Force enable zoom" Chrome settings actif.
//   Fix runtime indépendant des hints : LandscapeBlocker overlay full-screen
//   via matchMedia(orientation:landscape) + PinchZoomBlocker preventDefault
//   sur touchstart/move 2+ doigts + gesturestart/change/end + double-tap +
//   ctrl+wheel. Marche partout, tous browsers.
// v29 (2026-06-05, Pascal) : #402 Référencement des cards.
//   Verbatim Pascal : "il devrait trouver Young thug car il est dans la
//   DB en card donc on référence mal les cards il faut un module
//   référencement qui s'occupe de récupérer les descriptions les titres
//   les hashtags pour les recevoir dans les recherches".
//   Module nouveau /lib/search/metadata-map.ts (CardMetadataMap discriminated
//   union). Migration FTS5 card_search (unicode61 accent-insensitive) +
//   colonne metadata_map sur posts + direct_cards. createPost/createDirectCard
//   indexent désormais au moment de la création. T2M Officiel search_db_posts
//   utilise FTS5 (titre/auteur/hashtags) puis LIKE en fallback. Bump SW pour
//   invalider l'app shell après MAJ.
// v28 (2026-06-05, Pascal) : ROLLBACK refacto db.ts (#401 "MES AMIS ON DISPARU").
//   Le split #397 en 18 modules causait du tree-shaking Turbopack agressif
//   qui éliminait silencieusement updatePresence/getPresences/getOrCreate*
//   du bundle → /api/friends/list crashait en 500 → "Pas encore d'amis".
//   Fix : concaténation des 17 modules dans un seul lib/db.ts monolithique.
//   Les fichiers /lib/db/*.ts restent en place mais ne sont plus en prod.
//   Refacto à refaire propre plus tard, sur staging d'abord.
// v27 (2026-06-05, Pascal) : split monolithe lib/db.ts en 18 modules.
// v26 (2026-06-05, Pascal) : fix long-press iframe + isJustUrl tolérant (#400).
//   Bug Pascal : "on voix les url + peux pas envoyer les card spotify dans le hub".
//   (a) handleTouchMove tolère 10px de jitter (iframes Spotify/YT/TikTok
//       captent touchmove dès 1er pixel → annulait long-press 500ms →
//       impossible d'entrer en mode sélection → impossible de publier).
//   (b) isJustUrl assoupli : tolère whitespace + trailing newline, et
//       compare URLs sans paramètres tracking (?si=, ?t=, utm_, fbclid…).
//       → bulle URL doublon enfin cachée même avec URL ?si=tracking.
// v25 (2026-06-05, Pascal) : PII air-gap 7/7 layers COMPLET (#395).
//   Doctrine [[talk2me-pii-air-gap]] verbatim : "cette info en general ne
//   dois meme pas passer dans les tuyaux de l'IA ni meme la memoriser …
//   il dois refuser de la transmetre et dois lefacer en memoire". Lib
//   commune /lib/security/pii (6 patterns). Layer 1 user-snapshot retire
//   talk2me_id du system prompt. Layer 3 extract-habits filtre PII avant
//   upsert. Layer 4 history sanitize Léa + Officiel. Layer 5 scrubber
//   post-LLM étendu (IPv4, IBAN, CC, session tokens). Layer 6 background
//   memory-cleaner throttled 24h via /api/auth/me. Layer 7 refus actif
//   dans system prompts Léa + T2M Officiel + agent solo.
// v24 (2026-06-05, Pascal) : portrait-primary forcé dans manifest +
//   viewport userScalable=false + CSS touch-action: manipulation.
//   Bug Pascal : "pk lapli reagi au zoom deux et soriente quand on pivote
//   lecran". Cause #360 manifest 'any' + lock JS qui échoue. Solution :
//   manifest strict + meta viewport strict + CSS strict.
// v23 (2026-06-05) : PII air-gap 7 layers (en cours #395).
// v22 (2026-06-05, Pascal) : Talk2Me PII security (T2M Officiel + Léa).
// v22 (2026-06-05, Pascal) : Talk2Me PII security (T2M Officiel + Léa).
//   Bug fix verbatim Pascal : "léa mdonne des information devrait pas
//   connaitre comment ce fait il quelle connait mes id et quelle sait que
//   jai deux compte en terme de sécurité sa crains". T2M Officiel
//   search_users restreint à current+amis, sortie sanitisée (username +
//   display_name uniquement, plus de talk2me_id en sortie). System prompt
//   RÈGLE SÉCURITÉ ABSOLUE + scrubber regex final (drop "Talk2Me ID :
//   XXXXXX", emails, énumérations comptes). Léa sanitize quoted+history
//   pour ne pas recopier de PII fuitée antérieure. Doctrine
//   [[talk2me-pii-security]].
// v21 (2026-06-05, Pascal) : Talk2Me T2M Officiel cards attachées.
//   Bug fix verbatim Pascal : "cest surtout il ne sait pas me ressevir en
//   card dorigine le contenue quil a citer". T2M Officiel attache désormais
//   les UnifiedCards d'origine (jusqu'à 3) sous sa réponse texte. Nouvelle
//   colonne messages.attached_cards (JSON nullable, idempotent). Pipeline :
//   tool result → enrichWithCards → handleOfficielMessage extrait
//   UnifiedCard → runOfficielReply persiste + broadcast SSE → UnifiedBubble
//   rend via UnifiedCardRenderer (variant=inline-chat). Cap 3 enforced.
// v20 (2026-06-05, Pascal) : Talk2Me #391 — 4 fixes Pascal.
//   - Bug A : badge IA (✨ + nom) maintenant visible AUSSI en conv solo
//     (agent mappé sur 'peer-ai' dans /app/page.tsx, plus 'peer').
//   - Bug B : persistance ai_name. Rétro-fill DB ne ré-écrase plus 'Léa' à
//     chaque migration (clause `OR ai_name = 'Léa'` retirée). Le renommage
//     via /profile → POST /api/users/me/ai-name est désormais permanent.
//   - Bug C : /drafts onglet Publiées scrollable sur mobile (touch-none
//     remplacé par touch-pan-y sauf sur item en cours de drag).
//   - Bug D : /drafts onglets inversés. Publiées en premier (par défaut),
//     Brouillons en second. Hash #publiees est l'état par défaut.
// v19 (2026-06-05, Pascal) : Talk2Me #386 — Fix bulles T2M Officiel.
//   - Mapping bulle force 'peer-ai' pour ai_for_user_id = T2M_OFFICIEL_USER_ID
//     (jamais 'me-ai', même si compte connecté = T2M Officiel).
//   - Mapping bulle force 'peer' pour sender_id = T2M_OFFICIEL_USER_ID.
//   - UnifiedBubble : header AUTEUR séparé du quote pour bulles peer/peer-ai
//     avec quoted_preview (plus de confusion "PASCAL.REPIR" header → quote).
//   - resolveAuthorName : nom canonique stable "T2M Officiel" pour ai_for_user_id
//     ou sender_id = T2M_OFFICIEL_USER_ID.
//   - Handler officiel : interdiction stricte de tagger une IA personnelle
//     (system prompt + stripAiTags filet de sécurité).
//   - Route POST messages : anti-boucle T2M Officiel — si user tague son IA
//     perso (triggersAi=true) en conv T2M Officiel, on PRIORITISE l'IA perso
//     (1 question = 1 réponse, jamais les deux). Sender = T2M Officiel skip
//     la branche officielle (anti self-reply).
// v18 (2026-06-05, Pascal) : Universal Embed Hub Phase 4 (#389). EmbedRenderer
//   migré sur /api/embed-hub + UnifiedCardRenderer (variant inline-chat |
//   fullscreen-feed). 18 anciens components /components/embeds/*Embed.tsx
//   supprimés (URL-based). YouTubeEmbed/TikTokEmbed/ArticleReader/ArticlePreview
//   conservés (utilisés directement par MessageBubble/PostCard/UnifiedBubble
//   pour les données agent-search non-URL + Reader Mode #366). Cache 5 min
//   client (Map) + serveur (Map LRU 500 entrées). audioChannel + orientation
//   unlock préservés via UnifiedCardRenderer.
// v17 (2026-06-05, Pascal) : Universal Embed Hub Phase 2-3 (#380). 15
//   nouveaux extracteurs (Spotify/SoundCloud/Apple Music/Deezer/Vimeo/
//   Dailymotion/Twitch/Loom/Twitter/Facebook/Instagram/LinkedIn/Pinterest/
//   Reddit/Maps) branchés sur /api/embed-hub. Registry priorisé spécifique
//   → générique. T2M Officiel enrichit posts via postSummaryToUnifiedCard.
//   Anciens components /components/embeds/*Embed.tsx INTACTS (double système).
//   Migration UI = Phase 4 séparée. Cache bump pour rafraîchir demo page.
// v16 (2026-06-05, Pascal) : logo T2M officiel intégré (#386). 4 emplacements
//   validés : PWA icons (/icons/icon-192, icon-512, icon-maskable-512,
//   apple-touch-icon, favicon-16/32), favicon onglet, avatar T2M Officiel
//   (/avatars/t2m-officiel.png + DB users.avatar_url updated), splash
//   /app/loading.tsx, header /signin. Master = /brand/t2m-logo-master.png
//   (1254x1254). Manifest+layout metadata mis à jour. Cache bump pour
//   forcer refetch icons + manifest.
// v15 (2026-06-05, Pascal) : viewer /mes-cards/[id] + drag & drop reorder
//   dans /drafts (#383). Tap aperçu → /mes-cards/<id> (plus /home). Scroll
//   vertical = SES cards uniquement (pas le feed mixte). Long-press 500ms
//   + glisser = réordonne la liste (POST /api/cards/reorder batch). DB :
//   ALTER ADD COLUMN order_position INTEGER sur posts + direct_cards.
// v14 (2026-06-05, Pascal) : fix bug "Guest" hardcodé dans le header des cards
//   /home (#378). API /api/posts enrichi avec `author` (display_name + avatar)
//   via 1 SELECT IN batch sur users. PostCard + ImageCardDisplay +
//   VideoCardDisplay + TexteCardDisplay rendent le vrai display_name.
// v13 (2026-06-05, Pascal) : 10 nouvelles plateformes embed (Instagram,
//   SoundCloud, Vimeo, Reddit, Twitch clip+channel+video, Dailymotion,
//   LinkedIn, Pinterest, Loom, Apple Music, Deezer). Pattern uniforme
//   w-full max-w-full mx-auto rounded-2xl + aspect ratios par média.
//   audioChannel branché sur audio/vidéo. Slash final toléré.
// v12 (2026-06-05, Pascal) : largeur uniforme embed cards (YT/TikTok/Spotify/
//   FB/Article/Twitter/Maps/Image/PDF) → w-full max-w-full mx-auto. Borders
//   parasites retirées. Aspect ratios préservés par média.
// v11 (2026-06-05, Pascal) : Facebook embeds (share/* resolver + iframe plugin
//   post.php / video.php). Pas de FB App ID requis pour contenus publics.
// v10 (2026-06-05, Pascal) : TikTokEmbed passe en iframe player/v1 directe
//   (le blockquote+embed.js ne re-process pas les nodes dynamiques en SPA).
// v45 (2026-06-07) : bump pour forcer la MAJ du SW (Hub/Shop/gabarit/Music
//   Card invisibles car l'ancien SW servait les assets en cache). À BUMPER À
//   CHAQUE DÉPLOIEMENT qui change l'UI, sinon les users ne voient pas les modifs.
// v9 (2026-06-05) : fix regex url-parser tolère slash final.
// v8 (2026-06-04) : TikTok shortcode resolver + manifest orientation=any.
// v70 (2026-06-07) : composer média en 9:16 vertical (= cadrage exact du post).
//   Seul changement : la photo cadrée dans le composer = celle publiée.
// v69 (2026-06-07) : RESET — composer + publication remis à l'état stable du
//   dernier commit (annulation de toutes les modifs d'affichage du jour).
// v66 (2026-06-07) : composer = postcard IDENTIQUE (carte 9:16, bulle+nom user
//   en bas avant la description, titre/desc/#/@, disque son, produit horizontal).
// v65 (2026-06-07) : carte PRODUIT horizontale en publication (ShopCard +
//   aperçu produit sur posts) = exactement la zone produit du gabarit.
const CACHE_NAME = 'talk2me-v487';
const STATIC_ASSETS = ['/', '/manifest.json'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((c) => c.addAll(STATIC_ASSETS).catch(() => {}))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Network-first pour HTML/API, cache-first pour assets
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // Pas de cache API : network direct
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  // MÉDIAS LOURDS (GLB avatars, uploads, clips mocap) : RÉSEAU DIRECT, jamais en
  // cache. Un GLB de plusieurs Mo téléchargé partiellement et mis en cache =
  // fichier corrompu servi à vie → l'avatar ne charge plus. (Pascal 2026-06-18)
  if (url.pathname.startsWith('/uploads/') ||
      url.pathname.startsWith('/avatar-anim/') ||
      url.pathname.endsWith('.glb') || url.pathname.endsWith('.vrma')) {
    return;
  }

  // Navigation HTML : network-first, fallback cache
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request).catch(() => caches.match('/'))
    );
    return;
  }

  // Assets statiques : cache-first
  if (e.request.method === 'GET') {
    e.respondWith(
      caches.match(e.request).then((cached) =>
        cached ||
        fetch(e.request).then((res) => {
          if (res.ok && res.type === 'basic') {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(e.request, clone));
          }
          return res;
        })
      )
    );
  }
});

// ===== Web Push (Pascal 2026-06-11) =====
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { data = { body: event.data && event.data.text ? event.data.text() : '' }; }
  const title = data.title || 'Talk2Me';
  // Notif d'APPEL (tag 'call-…') : reste affichée jusqu'à action + vibration d'appel.
  const isCall = typeof data.tag === 'string' && data.tag.startsWith('call-');
  const options = {
    body: data.body || '',
    icon: '/icons/notif-icon-192-v2.png',   // grande icône : bulle rouge T2M
    badge: '/icons/badge-96-v2.png',        // barre d'état : silhouette blanche
    tag: data.tag || undefined,
    data: { url: data.url || '/' },
    vibrate: isCall ? [400, 200, 400, 200, 400] : [80, 40, 80],
    requireInteraction: isCall,
    renotify: isCall,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ('focus' in c) { c.navigate(url); return c.focus(); }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});

// Ré-abonnement AUTO quand le push expire (Pascal 2026-06-16). Sans ça, un
// abonnement périmé (410) ne se renouvelle jamais → l'appareil ne reçoit plus
// rien (cause des appels muets app fermée). Ici on recrée un abonnement et on
// le ré-enregistre côté serveur, de façon transparente.
function _b64ToU8(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil((async () => {
    try {
      const res = await fetch('/api/push', { cache: 'no-store' });
      const { publicKey } = await res.json().catch(() => ({}));
      if (!publicKey) return;
      const sub = await self.registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: _b64ToU8(publicKey),
      });
      await fetch('/api/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: sub }),
      });
    } catch (e) { /* best-effort */ }
  })());
});
