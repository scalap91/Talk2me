import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { SESSION_COOKIE } from '@/lib/auth-constants';

/**
 * Middleware Phase 1 multi-user :
 * - Si pas de cookie session → redirect /signin
 * - Le middleware ne vérifie PAS la validité DB du token (les routes API le
 *   font via getSessionUser). On accepte le faux positif "cookie présent
 *   mais expiré" : le user atterrit sur / → le client fait /api/auth/me →
 *   reçoit 401 → redirige côté client. Ça évite un lookup SQLite à chaque
 *   navigation (le middleware tourne sur Edge runtime, pas Node SQLite).
 *
 * Routes publiques whitelistées via le matcher (négatif) + override pour
 * /signin, /signup, /api/auth/*.
 */

const PUBLIC_PATH_PREFIXES = [
  // Talk2Me — Messagerie ENTREPRISE (Pascal 2026-06-09). Widget public collé
  // sur le site d'un client : l'iframe (/embed/biz/<clé>), son script
  // (/biz-widget.js) et l'API visiteur (/api/biz/*) sont PUBLICS (visiteur non
  // authentifié). La clé publique non devinable fait office d'auth ; chaque
  // route vérifie l'appartenance du visiteur à la conv. Aucune PII exposée.
  '/embed/biz/',
  '/api/biz/',
  '/biz-widget.js',
  // Talk2Me #428 — vitrine boutique PUBLIQUE (partageable sur le net, sans
  // compte). La page /boutique/[id] + son API de lecture. Pas de PII (nom,
  // description, produits commerce). POST/création et /shop gardent leur propre
  // auth dans la route (getCurrentUserFromRequest). /boutiques/[id] GET = lecture.
  '/boutique/',
  '/api/boutiques/',
  // #25 — détail produit lisible depuis la vitrine PUBLIQUE (variantes, photos,
  // description). Pas de PII. (search/import restent authed dans leur route.)
  '/api/dropship/detail',
  '/api/dropship/freight',
  // Petite boutique (espace chat) : API (auth vérifiée dans chaque route) + lien public /b/<clé>.
  '/api/simple-shop',
  '/b/',
  // Talk2Me Developer : API publique (auth par CLÉ API dans la route, pas par session).
  '/api/dev/',
  '/api/shop/store',
  '/signin',
  '/auth/verify/',
  '/api/auth/',
  // Talk2Me #326 — endpoints d'enrichissement appelés en interne par le
  // serveur (handlers tools) ; pas de PII utilisateur, juste des proxies
  // vers Nominatim/Overpass/Wikipedia/etc. Restent appelables par le client
  // authentifié sans souci, simplement non bloqués pour le S2S.
  '/api/geocode',
  '/api/search/',
  '/api/og',
  // Talk2Me — Reader Mode universel : extraction article via Readability.
  // Public car appelé par ArticleReader pour TOUT lien partagé en conv,
  // pas de PII, juste un proxy fetch+extract.
  '/api/article-reader',
  // Talk2Me — TikTok shortcode resolver (Pascal 2026-06-04).
  // Suit le redirect vm.tiktok.com/<short> → tiktok.com/@user/video/<id>
  // pour récupérer le video_id NUMÉRIQUE attendu par tiktok.com/embed.js.
  // Whitelist host TikTok côté handler (SSRF), aucune PII.
  '/api/tiktok-resolve',
  // Talk2Me — Facebook share resolver (Pascal 2026-06-05).
  // Suit le redirect facebook.com/share/<token> → URL canonique longue
  // (post.php/video.php exigent une URL canonique). Whitelist host FB
  // côté handler (SSRF), aucune PII.
  '/api/facebook-resolve',
  // Talk2Me #312 — Boussole technique publique (doctrine
  // [[airbizness-schema-technique]]). Aucune PII, juste le miroir du code.
  '/schema',
  // Talk2Me #335 — Diagnostic PWA public (debug install S23 FE).
  // Lit uniquement navigator/window, aucune PII serveur.
  '/pwa-diag',
  // Talk2Me — Doctrine fusion slides PostCard (#xxx). Page de démonstration
  // pure (fixtures statiques) pour vérifier visuellement l'heuristique de
  // groupage des slides. Aucune PII, aucun appel API.
  '/demo-postcard-fusion',
  // Talk2Me — Universal Embed Hub Phase 1 (Pascal 2026-06-05).
  // Pipeline unifié URL → UnifiedCard. Endpoint proxy vers extractors
  // internes (oEmbed YouTube, tiktok-resolve, /api/og). Aucune PII, juste
  // un agrégateur de métadonnées publiques. Doctrine
  // `project_talk2me_universal_embed_hub`.
  '/api/embed-hub',
  '/demo-unified-hub',
  // Talk2Me #406 — AI Ops daemon endpoint. Le daemon PM2 (ai-ops-daemon)
  // n'a pas de session cookie ; il s'authentifie via header
  // x-ai-ops-daemon-token (vérifié côté route). Les autres routes admin
  // ai-ops (status/cleanup/patch) restent protégées par le cookie session.
  '/api/admin/ai-ops/run-once',
  '/api/admin/ai-ops/force-fix',
  // Talk2Me #408b — Boussole technique : endpoints alimentant les pages
  // publiques /schema (Card Qualité Léa + Source viewer). Aucune PII : la
  // courbe Léa expose des moyennes de scores agents, et le source viewer
  // n'expose QUE les fichiers whitelistés (cf. WHITELIST dans route.ts).
  '/api/schema/',
  // Talk2Me #420 — Bibliothèque musicale libre de droits (catalogue +
  // page transparence licences). Aucune PII : la lib est statique.
  '/api/audio-lib',
  '/credits/audio',
  // NB #422 : les proxys /api/music/* NE sont PAS whitelistés volontairement.
  // Le picker musical est utilisé dans l'éditeur VideoCard, donc par un user
  // déjà loggé : son cookie passe le middleware, et chaque route /api/music/*
  // vérifie elle-même getCurrentUserFromRequest. Auth stricte conservée.
];

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PATH_PREFIXES.some((p) => pathname === p || pathname.startsWith(p))) {
    return true;
  }
  return false;
}

// Talk2Me #428 — routes de l'app de 1er niveau : elles gardent leur auth et NE
// sont JAMAIS interprétées comme un slug boutique. Tout AUTRE segment racine
// unique (talk2me.fr/<slug>) est traité comme une vitrine boutique PUBLIQUE.
// ⚠️ Ajouter ici tout nouveau dossier top-level de app/ pour ne pas le masquer.
const RESERVED_TOP_LEVEL = new Set([
  'admin', 'api', 'auth', 'b', 'biz', 'boutique', 'c', 'credits', 'demo-p329', 'demo-p5',
  'demo-postcard-fusion', 'demo-unified-hub', 'drafts', 'embed', 'friends', 'home', 'ma-boutique',
  'lot2-proof', 'mes-cards', 'messages', 'profile', 'pwa-diag', 'saved-cards',
  'schema', 'sfu-test', 'signin', 'signup', 'sound-test', 'trash', 'u',
  'uploads', 'wallet', 'sms', 'call', 'drive',
]);

function isPublicBoutiqueSlug(pathname: string): boolean {
  const m = pathname.match(/^\/([a-zA-Z0-9_-]+)\/?$/);
  if (!m) return false;
  return !RESERVED_TOP_LEVEL.has(m[1].toLowerCase());
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (isPublicPath(pathname) || isPublicBoutiqueSlug(pathname)) {
    return NextResponse.next();
  }

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) {
    const url = req.nextUrl.clone();
    url.pathname = '/signin';
    url.search = '';
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // Exclut next-internals, statics, manifest, sw, icons, uploads, favicon,
  // avatars, brand (logo T2M officiel #386).
  matcher: [
    '/((?!_next/|manifest\\.json|sw\\.js|icons/|uploads/|avatars/|brand/|audio-lib/|talk2me\\.apk|favicon\\.ico|robots\\.txt|sitemap\\.xml).*)',
  ],
};
