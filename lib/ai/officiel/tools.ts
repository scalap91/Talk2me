/**
 * Talk2Me #379 — Tools de l'IA T2M Officiel (Pascal 2026-06-05).
 * Doctrine [[talk2me-officiel-ia]] : IA institutionnelle, branchée UNIQUEMENT
 * sur la DB Talk2Me. ZÉRO appel externe (pas de YouTube/TikTok/OSM/etc.).
 *
 * Hooks dans `OFFICIEL_TOOLS` (schémas OpenAI) + `OFFICIEL_HANDLERS` (exec).
 * Tout handler retourne un objet sérialisable JSON.
 */

import OpenAI from 'openai';
import {
  searchDbPosts,
  searchCards,
  loadPostsByIds,
  getTopPostsByMetric,
  getBuzzCards,
  getLegalDoc,
  getTutorial,
  getPostStats,
  searchUsers,
  listFriendIds,
  type DbPostWithMessagesAndAuthor,
  type DbUser,
  type LegalDocRow,
  type PostStatsRow,
  type TutorialStep,
} from '@/lib/db';
import { buildUnifiedCard } from '@/lib/embed-hub';
import type { UnifiedCard } from '@/lib/embed-hub/types';
import { extractUrls } from '@/lib/url-parser';

export const OFFICIEL_TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'search_db_posts',
      description:
        "Cherche dans les posts Talk2Me par mots-clés. Retourne posts publics existants (non-archivés, non-supprimés). À utiliser quand un user demande 'tu as un post sur X', 'cherche un truc sur Y' dans Talk2Me.",
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Mots-clés de recherche' },
          limit: { type: 'integer', minimum: 1, maximum: 10 },
        },
        required: ['query'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_top_posts',
      description:
        "Top posts Talk2Me par métrique sur une fenêtre temporelle. Pour 'les posts les plus likés cette semaine', 'top vues du mois', etc.",
      parameters: {
        type: 'object',
        properties: {
          metric: {
            type: 'string',
            enum: ['likes', 'views', 'shares', 'saves'],
            description: 'Métrique à classer',
          },
          window: {
            type: 'string',
            enum: ['day', 'week', 'month', 'all'],
            description: 'Fenêtre temporelle',
          },
          limit: { type: 'integer', minimum: 1, maximum: 10 },
        },
        required: ['metric', 'window'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_buzz_cards',
      description:
        "Cards Talk2Me qui buzz actuellement (score combiné likes/vues/shares/saves avec décroissance temporelle). Pour 'un truc qui buzz', 'qu'est-ce qui marche'.",
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'integer', minimum: 1, maximum: 10 },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_users',
      description:
        "Cherche un user Talk2Me par username partiel ou nom d'affichage, RESTREINT aux contacts du user courant (lui-même + amis acceptés). Renvoie UNIQUEMENT username + display_name + avatar (jamais d'ID interne, jamais d'email). Si le résultat ne tombe dans aucun contact → liste vide.",
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'username ou nom partiel' },
        },
        required: ['query'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_legal_doc',
      description:
        "Récupère un document légal Talk2Me (mentions légales, CGU, CGV, privacy, RGPD). Pour 'mentions légales', 'CGU', 'comment vous gérez mes données'.",
      parameters: {
        type: 'object',
        properties: {
          topic: {
            type: 'string',
            enum: ['mentions_legales', 'cgu', 'cgv', 'privacy', 'rgpd'],
          },
        },
        required: ['topic'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_tutorial',
      description:
        "Récupère un tuto interactif Talk2Me pour un topic donné. Pour 'comment ça marche', 'comment publier', 'comment ajouter un ami', 'l'éditeur de cards'.",
      parameters: {
        type: 'object',
        properties: {
          topic: {
            type: 'string',
            enum: ['home', 'cards', 'editor', 'amis', 'embed', 'select'],
          },
        },
        required: ['topic'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_post_stats',
      description:
        "Métriques agrégées (likes, vues, shares, saves, commentaires) d'un post Talk2Me par son id.",
      parameters: {
        type: 'object',
        properties: {
          post_id: { type: 'string' },
        },
        required: ['post_id'],
        additionalProperties: false,
      },
    },
  },
];

// ============================================================================
// Handlers
// ============================================================================

export interface OfficielToolResult {
  ok: boolean;
  [key: string]: unknown;
}

/**
 * Talk2Me PII security (Pascal 2026-06-05) — Doctrine [[talk2me-pii-security]].
 * AUCUNE info interne d'user (talk2me_id, email, ai_name, ai_avatar_url,
 * last_seen, created_at, password_hash, internal id) ne doit jamais passer
 * dans la sortie d'un tool. Seuls username + display_name sont publics.
 * `author.id` retiré : c'était l'UUID interne, inutile à l'IA et dangereux
 * comme fuite d'identifiant croisable.
 */
export interface OfficielPostSummary {
  id: string;
  created_at: number;
  likes: number;
  views: number;
  share_count: number;
  save_count: number;
  comment_count: number;
  author: {
    username: string;
    display_name: string | null;
  } | null;
  preview: string;
  url: string;
  /**
   * Talk2Me #402 — URL externe résolvable (YouTube/TikTok/Spotify/article).
   * Reconstruite depuis les colonnes JSON résolues (youtube/tiktok) quand
   * messages.text est vide. Utilisée par postSummaryToUnifiedCard pour
   * ré-générer la UnifiedCard à attacher à la réponse T2M Officiel.
   */
  resolvable_url?: string;
  /** Snippet FTS5 (passage matché, avec [token] highlight). */
  snippet?: string;
}

/**
 * Talk2Me #402 — Extrait une URL résoluble depuis un post (Pascal 2026-06-05).
 *
 * Cherche dans cet ordre :
 *   1) URL http(s) dans messages.text
 *   2) Colonne youtube résolue → reconstruit l'URL YouTube canonique
 *   3) Colonne tiktok résolue → reconstruit l'URL TikTok canonique
 *
 * Sans ce helper, les cards YouTube partagées (text="") n'étaient JAMAIS
 * re-servies comme UnifiedCard par T2M Officiel.
 */
function findResolvableUrl(p: DbPostWithMessagesAndAuthor): string | null {
  for (const m of p.messages) {
    const fromText = extractUrls(m.text || '');
    if (fromText.length > 0) return fromText[0];
    const y = (m as any).youtube;
    if (y && typeof y === 'object' && y.video_id) {
      return `https://www.youtube.com/watch?v=${y.video_id}`;
    }
    const t = (m as any).tiktok;
    if (t && typeof t === 'object') {
      const user = t.author_handle || t.user;
      const vid = t.video_id;
      if (user && vid) return `https://www.tiktok.com/@${user}/video/${vid}`;
      if (vid) return `https://vm.tiktok.com/${vid}`;
    }
  }
  return null;
}

function summarizePost(p: DbPostWithMessagesAndAuthor): OfficielPostSummary {
  const firstText =
    p.messages.find((m) => (m.text || '').trim().length > 0)?.text || '';
  const preview = firstText.slice(0, 140).trim();
  const resolvableUrl = findResolvableUrl(p);
  return {
    id: p.id,
    created_at: p.created_at,
    likes: p.likes || 0,
    views: p.views || 0,
    share_count: (p as any).share_count || 0,
    save_count: (p as any).save_count || 0,
    comment_count: (p as any).comment_count || 0,
    author: p.author
      ? {
          username: p.author.username,
          display_name: p.author.display_name,
        }
      : null,
    preview,
    url: `/home?post=${p.id}`,
    ...(resolvableUrl ? { resolvable_url: resolvableUrl } : {}),
  };
}

/**
 * Talk2Me #380 Phase 2-3 — branchement Universal Embed Hub.
 *
 * Quand un post Talk2Me contient une URL externe (YouTube, TikTok, Spotify,
 * etc.), on enrichit son summary avec une `UnifiedCard` produite par le hub.
 * L'IA officielle peut ainsi proposer la card prête à render au lieu d'un
 * simple texte. Doctrine [[talk2me-hub-universel]] : Cards = couche unifiée.
 *
 * Si le post n'a pas d'URL externe → pas de unified_card (juste le preview).
 * Si l'extracteur échoue → buildUnifiedCard retourne une fallback card (jamais
 * d'erreur brute, doctrine [[feedback-talktome-no-excuses]]).
 *
 * Note : la résolution est best-effort. Le timeout du hub (5s) + le fallback
 * gracieux assurent qu'un post non-résolu n'empêche pas la réponse de l'IA.
 */
export async function postSummaryToUnifiedCard(
  summary: OfficielPostSummary,
  baseUrl: string,
): Promise<UnifiedCard | null> {
  // Talk2Me #402 (Pascal 2026-06-05) — utilise resolvable_url en priorité
  // pour les YouTube/TikTok cards dont messages.text est vide.
  const url =
    summary.resolvable_url ||
    (extractUrls(summary.preview || '')[0] ?? null);
  if (!url) return null;
  try {
    const card = await buildUnifiedCard(url, { baseUrl });
    return {
      ...card,
      meta: {
        ...(card.meta || {}),
        posted_by: summary.author?.username || null,
        posted_at: summary.created_at,
        post_id: summary.id,
        likes: summary.likes,
        views: summary.views,
        share_count: summary.share_count,
        save_count: summary.save_count,
        comment_count: summary.comment_count,
      },
    };
  } catch {
    return null;
  }
}

/**
 * Helper qui enrichit une liste de summaries en parallèle (limit timeout
 * global à 6s pour éviter de bloquer la réponse de l'IA officielle).
 */
async function enrichWithCards(
  posts: OfficielPostSummary[],
  baseUrl: string,
): Promise<Array<OfficielPostSummary & { unified_card?: UnifiedCard }>> {
  const enriched = await Promise.all(
    posts.map(async (p) => {
      const card = await postSummaryToUnifiedCard(p, baseUrl);
      return card ? { ...p, unified_card: card } : p;
    }),
  );
  return enriched;
}

/**
 * Talk2Me PII security (Pascal 2026-06-05) — sortie sanitisée d'un user pour
 * l'IA T2M Officiel. Pas de talk2me_id, pas d'email, pas d'UUID interne, pas
 * d'ai_name, pas de timestamps. Juste l'identité publique : username,
 * display_name, avatar_url. `is_self` aide l'IA à ne pas confondre l'user
 * courant avec un ami homonyme.
 * Doctrine [[talk2me-pii-security]].
 */
function summarizeUserPublic(u: DbUser, selfId: string | null) {
  return {
    username: u.username,
    display_name: u.display_name,
    avatar_url: u.avatar_url,
    is_self: selfId !== null && u.id === selfId,
  };
}

export interface OfficielHandlerCtx {
  /** baseUrl pour appeler `/api/embed-hub` et autres sub-endpoints. */
  baseUrl?: string;
  /**
   * Talk2Me PII security (Pascal 2026-06-05) — user courant (sender) propagé
   * aux handlers pour scoper `search_users` à current + amis. Sans senderUser
   * search_users retourne [] (fail-safe).
   * Doctrine [[talk2me-pii-security]].
   */
  senderUser?: DbUser | null;
}

export type OfficielHandler = (
  args: Record<string, unknown>,
  ctx?: OfficielHandlerCtx,
) => Promise<OfficielToolResult> | OfficielToolResult;

export const OFFICIEL_HANDLERS: Record<string, OfficielHandler> = {
  search_db_posts: async (args, ctx) => {
    const query = typeof args.query === 'string' ? args.query : '';
    const limit =
      typeof args.limit === 'number' ? Math.floor(args.limit) : 5;

    // Talk2Me #402 — Référencement cards (Pascal 2026-06-05).
    // Verbatim Pascal : "il devrait trouver Young thug car il est dans la
    // DB en card […] suivant la card il faut maper et sortir une map que
    // peut lire T2M". Pipeline :
    //   1) FTS5 sur card_search (titre/auteur/hashtags/description) ←
    //      attrape les YouTube/Spotify/TikTok dont le titre n'est PAS
    //      dans messages.text.
    //   2) LIKE legacy sur messages.text en fallback (texte conversationnel).
    //   3) Merge dédupé en préservant l'ordre rank FTS5.
    const baseUrl = ctx?.baseUrl || 'http://localhost:3010';

    const hits = searchCards(query, Math.max(limit, 10));
    const postIdsFromFts: string[] = [];
    const snippetByPostId = new Map<string, string>();
    for (const h of hits) {
      if (h.kind !== 'post') continue; // direct_cards = TODO future iteration
      if (postIdsFromFts.includes(h.post_id)) continue;
      postIdsFromFts.push(h.post_id);
      snippetByPostId.set(h.post_id, h.snippet);
    }
    const postsFromFts = postIdsFromFts.length
      ? loadPostsByIds(postIdsFromFts)
      : [];
    // Filtrer deleted/archived (loadPostsByIds ne filtre pas).
    const postsFromFtsClean = postsFromFts.filter(
      (p) => !(p as any).deleted_at && !(p as any).archived_at,
    );

    // Fallback LIKE pour ne pas régresser les anciens posts purement textuels.
    const postsFromLike = searchDbPosts(query, limit);

    const seen = new Set<string>(postsFromFtsClean.map((p) => p.id));
    const merged: DbPostWithMessagesAndAuthor[] = [...postsFromFtsClean];
    for (const p of postsFromLike) {
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      merged.push(p);
      if (merged.length >= limit) break;
    }
    const capped = merged.slice(0, limit);

    const summaries = capped.map((p) => {
      const s = summarizePost(p);
      const snippet = snippetByPostId.get(p.id);
      if (snippet) (s as any).snippet = snippet;
      return s;
    });
    const enriched = await enrichWithCards(summaries, baseUrl);
    return { ok: true, posts: enriched };
  },
  get_top_posts: async (args, ctx) => {
    const metric = (args.metric as string) || 'likes';
    const window = (args.window as string) || 'week';
    const limit =
      typeof args.limit === 'number' ? Math.floor(args.limit) : undefined;
    if (!['likes', 'views', 'shares', 'saves'].includes(metric)) {
      return { ok: false, error: 'invalid_metric' };
    }
    if (!['day', 'week', 'month', 'all'].includes(window)) {
      return { ok: false, error: 'invalid_window' };
    }
    const posts = getTopPostsByMetric(
      metric as any,
      window as any,
      limit ?? 5,
    );
    const summaries = posts.map(summarizePost);
    const baseUrl = ctx?.baseUrl || 'http://localhost:3010';
    const enriched = await enrichWithCards(summaries, baseUrl);
    return {
      ok: true,
      metric,
      window,
      posts: enriched,
    };
  },
  get_buzz_cards: async (args, ctx) => {
    const limit =
      typeof args.limit === 'number' ? Math.floor(args.limit) : undefined;
    const posts = getBuzzCards(limit ?? 5);
    const summaries = posts.map(summarizePost);
    const baseUrl = ctx?.baseUrl || 'http://localhost:3010';
    const enriched = await enrichWithCards(summaries, baseUrl);
    return { ok: true, posts: enriched };
  },
  /**
   * Talk2Me PII security (Pascal 2026-06-05) — Bug : Léa fuitait talk2me_id +
   * comptes d'autres users en clair via search_users (`pascalrepir_e20 — Talk2Me
   * ID : 588770`). Fix : scope strict current user + amis acceptés, et sortie
   * SANITIZÉE (juste username/display_name/avatar, JAMAIS talk2me_id/email/uuid).
   * Doctrine [[talk2me-pii-security]].
   *
   * Fail-safe : sans ctx.senderUser → retourne liste vide (jamais d'élargissement
   * accidentel à toute la DB).
   */
  search_users: (args, ctx) => {
    const sender = ctx?.senderUser || null;
    if (!sender) {
      console.warn('[officiel/search_users] no senderUser in ctx → empty result');
      return { ok: true, users: [] };
    }
    const query = typeof args.query === 'string' ? args.query : '';
    if (!query.trim()) return { ok: true, users: [] };

    // Garde-fou explicite : si l'IA passe un Talk2Me ID 6 chiffres comme query
    // (hallucination ou tentative d'énumération), on refuse — on ne révèle
    // jamais l'existence d'un user via lookup ID.
    if (/^\d{6}$/.test(query.trim())) {
      console.warn(
        '[officiel/search_users] talk2me_id lookup refused for AI',
        `sender=${sender.id}`,
      );
      return { ok: true, users: [] };
    }

    const friendIds = listFriendIds(sender.id);
    const allowedIds = new Set<string>([sender.id, ...friendIds]);

    // searchUsers(query, null) ne fournit pas d'exclusion donc on filtre nous.
    const raw = searchUsers(query, null);
    const inScope = raw.filter((u) => allowedIds.has(u.id));
    return {
      ok: true,
      users: inScope.slice(0, 10).map((u) => summarizeUserPublic(u, sender.id)),
    };
  },
  get_legal_doc: (args) => {
    const topic = typeof args.topic === 'string' ? args.topic : '';
    const doc: LegalDocRow | null = getLegalDoc(topic);
    if (!doc) return { ok: false, error: 'not_found', topic };
    return {
      ok: true,
      topic: doc.topic,
      content_md: doc.content_md,
      updated_at: doc.updated_at,
    };
  },
  get_tutorial: (args) => {
    const topic = typeof args.topic === 'string' ? args.topic : '';
    const tuto = getTutorial(topic);
    if (!tuto) return { ok: false, error: 'not_found', topic };
    const steps: TutorialStep[] = tuto.steps;
    return { ok: true, topic: tuto.topic, steps };
  },
  get_post_stats: (args) => {
    const post_id = typeof args.post_id === 'string' ? args.post_id : '';
    const stats: PostStatsRow | null = getPostStats(post_id);
    if (!stats) return { ok: false, error: 'not_found', post_id };
    return { ok: true, ...stats };
  },
};

/** Liste des noms de tools exposés (utile pour la blacklist / logs). */
export const OFFICIEL_TOOL_NAMES: string[] = OFFICIEL_TOOLS.map((t) =>
  t.type === 'function' ? t.function.name : '',
).filter((n) => n.length > 0);
