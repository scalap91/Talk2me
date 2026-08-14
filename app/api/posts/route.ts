// /home/ubuntu/talktome/app/api/posts/route.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { fromPost } from '@/lib/cards/adapt';
import { writeCardFile, readCardFileRaw } from '@/lib/cards/card-file';
import {
  getOrCreateUserConversation,
  createPost,
  getPosts,
  getConversationMessages,
  getMixedFeed,
  getMixedFeedRankedPage,
  getUnifiedFeedRecentPage,
  getLikedCardIds,
  listFriends,
} from '@/lib/db';
import { isFeatureEnabled } from '@/lib/app-settings';
import type {
  DbPostWithMessagesAndAuthor,
  DbMessage,
  DbDirectCardWithAuthor,
  PostAuthor,
} from '@/lib/db';
import type {
  YouTubeCardData,
  PlaceCardData,
  RecipeCardData,
  WebSearchData,
  ProductCardData,
} from '@/lib/chat-types';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { countSlides } from '@/lib/posts/slides';
import { maskContactInfo } from '@/lib/cards/contact-guard'; // anti-désintermédiation : masque un n° dans la légende
import { blockedRelatedIds } from '@/lib/moderation';
import { getAnnoncesNear } from '@/lib/annonces-deposit';
import { shopSectionsState, resolveCardSection } from '@/lib/app-settings';
import { parseCard } from '@/lib/cards/supercard';
import { entityRefFromCardId } from '@/lib/cards/engine/resolve-ref';
import { getArticleMeta } from '@/lib/cards/engine/article';
import { getSyncedLyrics, type LrcLine } from '@/lib/cards/engine/lyrics';
import { getFeedFromCards, getFeedFromCardsRanked, searchCardsFeed } from '@/lib/cards/feed-from-cards';
import { isRestricted } from '@/lib/sanctions';
import { buildFeedCardPlan } from '@/lib/cards/plan/feed-plan';
import { contributorCount } from '@/lib/cards/engine/contributors';
import { getRatingSummary } from '@/lib/cards/engine/ratings';
import { getSimpleShop, listItems } from '@/lib/simple-shop';

/** Page-entité vivante : article canonique DERRIÈRE une card (badge + extrait + lien). */
interface FeedEnrichment { snippet: string; contributors: number; path: string; article: string }

/**
 * Attache `enrichment` à un item SI une entité canonique (article fusionné) existe derrière.
 * AJOUT SEULEMENT, best-effort : toute erreur → aucun champ (le feed n'est JAMAIS bloqué).
 */
/** Paroles karaoké synchro DERRIÈRE une card son (slide gauche). Best-effort, ajout seulement. */
function attachLyrics(item: { id?: string } & Record<string, unknown>): void {
  try {
    if (!item.id) return;
    const r = getSyncedLyrics(entityRefFromCardId(item.id));
    if (r && r.synced.length) (item as { lyrics?: { synced: LrcLine[]; calibrated: boolean } }).lyrics = { synced: r.synced, calibrated: r.calibrated };
  } catch {
    /* best-effort : jamais bloquer le feed */
  }
}

function attachEnrichment(item: { id?: string } & Record<string, unknown>): void {
  try {
    if (!item.id) return;
    const ref = entityRefFromCardId(item.id);
    const meta = getArticleMeta(ref);
    if (!meta) return;
    // Article jugé douteux / signalé → on ne le pousse pas.
    if (getRatingSummary(ref).flagged) return;
    const article = meta.body;
    // Le TEXTE de l'article vit SUR la card mais dans un SLIDER dédié (composant à part),
    // PAS en écrasant la légende (sinon mur de texte selon la branche de rendu). Pascal 2026-07-08.
    (item as { enrichment?: FeedEnrichment }).enrichment = {
      snippet: (article.split(/\n{2,}/).find((p) => p.trim()) || article).replace(/\*\*|[#*`]/g, '').trim().slice(0, 170),
      contributors: contributorCount(ref),
      path: `/card/${item.id}`,
      article,
    };
  } catch {
    /* best-effort : jamais bloquer le feed */
  }
}

// Garde-fou : même SOURCE UNIQUE de découpage que le rendu (PostCard) et le
// composer (SelectionFAB) → le nombre annoncé == le nombre rendu.
const MAX_SLIDES = 6;
function estimateSlideCount(msgs: DbMessage[]): number {
  return countSlides(msgs as unknown as Parameters<typeof countSlides>[0]);
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface PostResponseMessage {
  id: string;
  role: 'user' | 'agent';
  content: string;
  links: string[];
  timestamp: number;
  youtube?: YouTubeCardData | null;
  places?: PlaceCardData[] | null;
  recipe?: RecipeCardData | null;
  requires_geoloc?: boolean;
  intent_query?: string | null;
  intent_label_fr?: string | null;
  user_lat?: number | null;
  user_lng?: number | null;
  web_search?: WebSearchData | null;
  products?: ProductCardData[] | null;
  ai_name?: string | null;
  ai_avatar_url?: string | null;
}

interface PostResponse {
  id: string;
  createdAt: number;
  likes: number;
  views: number;
  messages: PostResponseMessage[];
  /** Talk2Me #378 — auteur public du post pour le header /home (display_name + avatar). */
  author: PostAuthor | null;
}

export function toPostResponse(post: DbPostWithMessagesAndAuthor): PostResponse {
  return {
    id: post.id,
    createdAt: post.created_at,
    likes: post.likes,
    views: post.views,
    author: post.author ?? null,
    messages: post.messages.map((msg) => {
      const message: PostResponseMessage = {
        id: msg.id,
        role: msg.role,
        content: msg.text,
        links: msg.links,
        timestamp: msg.created_at,
        ai_name: msg.ai_name ?? null,
        ai_avatar_url: msg.ai_avatar_url ?? null,
      };
      if (msg.youtube !== undefined) {
        message.youtube = msg.youtube as YouTubeCardData | null;
      }
      if (msg.places !== undefined) {
        message.places = msg.places as PlaceCardData[] | null;
      }
      if (msg.recipe !== undefined) {
        message.recipe = msg.recipe as RecipeCardData | null;
      }
      if (msg.requires_geoloc !== undefined) {
        message.requires_geoloc = msg.requires_geoloc;
      }
      if (msg.intent_query !== undefined) {
        message.intent_query = msg.intent_query;
      }
      if (msg.intent_label_fr !== undefined) {
        message.intent_label_fr = msg.intent_label_fr;
      }
      if (msg.user_lat !== undefined) {
        message.user_lat = msg.user_lat;
      }
      if (msg.user_lng !== undefined) {
        message.user_lng = msg.user_lng;
      }
      if (msg.web_search !== undefined) {
        message.web_search = msg.web_search as WebSearchData | null;
      }
      if (msg.products !== undefined) {
        message.products = msg.products as ProductCardData[] | null;
      }
      return message;
    }),
  };
}

export async function POST(request: NextRequest) {
  try {
    const user = getCurrentUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { messageIds } = body as { messageIds?: unknown };

    if (!Array.isArray(messageIds) || messageIds.length === 0) {
      return NextResponse.json({ error: 'messageIds required' }, { status: 400 });
    }

    // Ensure all are strings
    const ids: string[] = messageIds.filter((x): x is string => typeof x === 'string');
    if (ids.length === 0) {
      return NextResponse.json({ error: 'messageIds required' }, { status: 400 });
    }

    const conv = getOrCreateUserConversation(user.id);

    // Validation max slides côté serveur (backup du check front).
    // Charge les messages de la conv et filtre dans l'ordre demandé.
    const allMsgs = getConversationMessages(conv.id);
    const byId = new Map<string, DbMessage>();
    for (const m of allMsgs) byId.set(m.id, m);
    const orderedMsgs: DbMessage[] = [];
    for (const id of ids) {
      const m = byId.get(id);
      if (m) orderedMsgs.push(m);
    }
    const slideCount = estimateSlideCount(orderedMsgs);
    if (slideCount > MAX_SLIDES) {
      return NextResponse.json(
        { error: `too_many_slides`, slideCount, maxSlides: MAX_SLIDES },
        { status: 400 }
      );
    }

    const post = createPost(user.id, conv.id, ids);
    const resp = toPostResponse(post);
    // Card OS : le post émet SON `.card` (le producteur le fabrique via fromPost → fichier).
    try { await writeCardFile(fromPost(resp as unknown as Parameters<typeof fromPost>[0])); }
    catch (e) { console.error('[posts] émission .card:', e); }
    // Audit #65 : le POST renvoie is_owner/liked_by_me (le front n'a plus à reload). Post frais du
    // créateur → is_owner=true, liked_by_me=false. Sinon le post pouvait ne jamais remonter au feed.
    return NextResponse.json({ ...resp, is_owner: true, liked_by_me: false });
  } catch (err) {
    console.error('[posts] POST error:', err);
    return NextResponse.json({ error: 'invalid messageIds' }, { status: 400 });
  }
}

function directCardToItem(c: DbDirectCardWithAuthor) {
  const kind =
    c.type === 'video'
      ? 'video_card'
      : c.type === 'image'
        ? 'image_card'
        : 'texte_card';
  return {
    kind,
    id: c.id,
    user_id: c.user_id,
    type: c.type,
    media_url: c.media_url,
    caption: maskContactInfo(c.caption),
    text: maskContactInfo(c.text),
    bg_variant: c.bg_variant,
    post_type: (c as { post_type?: string | null }).post_type ?? null,
    category: (c as { category?: string | null }).category ?? null, // ex 'plat_maison' → le lecteur rend une carte horizontale
    // Plat : public_key du shop (tag [VITRINE:shopId] dans la caption) → le tap ouvre la FICHE /b/[key] (plats + Commander).
    plat_key: (() => {
      if ((c as { category?: string | null }).category !== 'plat_maison') return null;
      const mm = (c.caption || '').match(/\[VITRINE:([^\]]+)\]/);
      if (!mm) return null;
      try { return getSimpleShop(mm[1])?.public_key ?? null; } catch { return null; }
    })(),
    createdAt: c.created_at,
    created_at: c.created_at,
    likes: c.likes,
    views: c.views,
    // Lot A : counters secondaires + discriminant pour CardActionsBar.
    card_kind: 'direct_card' as const,
    share_count: c.share_count ?? 0,
    comment_count: c.comment_count ?? 0,
    // Talk2Me #378 — auteur public pour le header card.
    author: c.author ?? null,
    // Talk2Me #422 — musique attachée (UnifiedCard JSON sérialisé)
    attached_audio_json: c.attached_audio_json ?? null,
    // Talk2Me #425 — produit attaché (ProductCardData JSON) → Hub + Shop
    attached_product_json: c.attached_product_json ?? null,
    // Card OS : le `.card` stocké, lu par le feed via parseCard (source de vérité).
    dotcard: (c as { dotcard?: string | null }).dotcard ?? null,
  };
}

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const limitParam = url.searchParams.get('limit');
    const offsetParam = url.searchParams.get('offset');
    let limit = limitParam ? parseInt(limitParam, 10) : 20;
    if (isNaN(limit) || limit < 1) limit = 20;
    if (limit > 100) limit = 100;
    let offset = offsetParam ? parseInt(offsetParam, 10) : 0;
    if (isNaN(offset) || offset < 0) offset = 0;

    // Lot A : si user authentifié, on hydrate `liked_by_me` sur chaque item
    // via 1 seul SELECT VALUES batch (cf getLikedCardIds).
    const me = getCurrentUserFromRequest(request);

    // Hub (Pascal 2026-06-07) : sous-onglets de tri.
    //   scope=friends → seulement les posts de mes amis (pas les miens).
    //   scope=shop    → seulement les cards commerce (posts avec ProductCard),
    //                   triées tendance (popular) par défaut, visibles par tous.
    //   sort=popular  → tri par engagement (likes×3+vues) au lieu de la date.
    const scope = url.searchParams.get('scope');
    const sortParam = url.searchParams.get('sort');
    const commerceOnly = scope === 'shop';
    // Shop : tendance par défaut "pour le moment".
    const sort =
      sortParam === 'popular' || (commerceOnly && sortParam !== 'recent')
        ? 'popular'
        : 'recent';
    // AUTOUR (Pascal 2026-07-05) : le MÊME feed, filtré aux alentours. On renvoie les
    // annonces géolocalisées proches (toutes catégories) au format feed (kind image_card
    // + leur `.card` via dotcard) → PostFeed les rend comme n'importe quelle card. Pas de
    // page à part, pas de cercles : juste le feed, filtré. ~5 km par défaut.
    if (scope === 'around') {
      const latN = Number(url.searchParams.get('lat'));
      const lngN = Number(url.searchParams.get('lng'));
      if (!Number.isFinite(latN) || !Number.isFinite(lngN)) return NextResponse.json({ items: [], posts: [] });
      const near = getAnnoncesNear({ lat: latN, lng: lngN, radiusKm: 5 });
      const items = near.map((a) => ({
        kind: 'image_card' as const,
        id: a.id,
        user_id: '',
        type: 'image' as const,
        media_url: a.image_url,
        caption: a.title,
        text: null,
        bg_variant: null,
        post_type: 'annonce',
        card_kind: 'direct_card' as const,
        dotcard: a.dotcard,
        liked_by_me: false,
        is_owner: false,
        distance_km: a.distance_km,
      }));
      for (const it of items) { attachEnrichment(it); attachLyrics(it); }
      return NextResponse.json({ items, posts: [] });
    }

    let friendIds: string[] | undefined;
    if (scope === 'friends') {
      if (!me) {
        return NextResponse.json({ items: [], posts: [] });
      }
      friendIds = listFriends(me.id).map((u) => u.id);
      if (friendIds.length === 0) {
        return NextResponse.json({ items: [], posts: [] });
      }
    }

    // Feed « Tout » par défaut (pas de scope, pas de tri explicite) → CLASSEMENT TikTok
    // (engagement + fraîcheur, cf. getMixedFeedRankedPage). T2M Officiel n'est plus
    // jamais épinglé en tête. Les onglets explicites (sort=recent / sort=popular) et
    // les scopes (Amis/Shop) gardent leur comportement.
    const rankedDefault = !scope && !sortParam;
    // Flux unifié items[] = posts + direct_cards merge trié.
    // LOT 2 ④ : si le flag `unified_feed` est ON, le chemin "recent" explicite (sans scope)
    // est lu depuis la table UNIQUE unified_posts. Sinon (ou scope/popular) → chemin classique.
    const useUnified = !scope && sortParam === 'recent' && isFeatureEnabled('unified_feed');
    // RECHERCHE (Pascal 2026-07-27) : ?q= → on saute le feed classé ; les résultats viennent du VRAI
    // moteur FTS5 (searchCardsFeed, table `cards`) injecté au niveau baseItems (cf. plus bas).
    const searchQ = (url.searchParams.get('q') || '').trim();
    // UNIFICATION (Pascal 2026-08-14) : le feed lit `cards` (source unique) + ranking (cf. baseItems).
    // L'ancien agrégat posts+direct_cards n'est calculé QUE sur `?src=legacy` (secours).
    const legacy = url.searchParams.get('src') === 'legacy';
    const mixed = (searchQ || !legacy)
      ? []
      : rankedDefault
      ? getMixedFeedRankedPage(limit, offset)
      : useUnified
      ? getUnifiedFeedRecentPage(limit, offset)
      : getMixedFeed(limit, offset, {
          ...(friendIds ? { authorIds: friendIds } : {}),
          ...(commerceOnly ? { commerceOnly: true } : {}),
          ...(scope === 'friends' ? { friendsScope: true } : {}),
          sort,
        });

    // Construit la liste des candidats pour la requête batch likes.
    const candidates = mixed.map((m) =>
      m.kind === 'post'
        ? { kind: 'post' as const, id: m.data.id }
        : { kind: 'direct_card' as const, id: m.data.id }
    );
    const likedSet = me ? getLikedCardIds(me.id, candidates) : new Set<string>();

    const items = mixed.map((m) => {
      const cardKind = m.kind === 'post' ? 'post' : 'direct_card';
      const liked = likedSet.has(`${cardKind}:${m.data.id}`);
      if (m.kind === 'post') {
        return {
          kind: 'post' as const,
          ...toPostResponse(m.data),
          card_kind: 'post' as const,
          liked_by_me: liked,
          user_id: m.data.user_id,
          is_owner: !!me && me.id === m.data.user_id,
        };
      }
      const base = directCardToItem(m.data);
      return {
        ...base,
        liked_by_me: liked,
        is_owner: !!me && me.id === m.data.user_id,
      };
    });

    // Apple 1.2 — blocage : on masque du feed les contenus des users bloqués
    // (par moi) ou qui m'ont bloqué.
    // UNIFICATION Card OS (Pascal 2026-07-12, validé) : le feed est lu DIRECTEMENT depuis la table
    // `cards` (source de vérité unique) au lieu de l'agrégat posts/direct_cards/unified_posts.
    // `?src=legacy` garde l'ancien chemin en secours le temps de débrancher proprement le legacy.
    const baseItems = searchQ
      ? searchCardsFeed(searchQ, limit, me?.id)
      : legacy
      ? items // ?src=legacy → ancien agrégat posts+direct_cards (secours)
      : sortParam === 'recent'
      ? getFeedFromCards(limit, offset, { authorIds: friendIds, commerceOnly, meId: me?.id }) // onglet Récent = chrono
      : getFeedFromCardsRanked(limit, offset, { authorIds: friendIds, commerceOnly, meId: me?.id }); // DÉFAUT + Amis + Shop = `cards` rankées
    const blockedSet = me ? new Set(blockedRelatedIds(me.id)) : null;
    const filteredItems = blockedSet && blockedSet.size > 0
      ? baseItems.filter((it) => !blockedSet.has((it as { user_id?: string }).user_id || ''))
      : baseItems;
    // GOUVERNANCE — enforcement L2 (Pascal 2026-07-28) : VISIBILITÉ RÉDUITE. Un auteur sous
    // RESTRICTION (sanction ≥ 2) passe en FIN de page — jamais retiré (réduite, pas zéro).
    // Réversible : sanction levée → il remonte. Aucune donnée n'est effacée.
    const restrCache = new Map<string, boolean>();
    const isRestr = (uid?: string) => {
      if (!uid) return false;
      if (!restrCache.has(uid)) restrCache.set(uid, isRestricted(uid));
      return restrCache.get(uid)!;
    };
    const visibleItems = [
      ...filteredItems.filter((it) => !isRestr((it as { user_id?: string }).user_id)),
      ...filteredItems.filter((it) => isRestr((it as { user_id?: string }).user_id)),
    ];

    // Card OS : le lecteur lit le FICHIER `.card`. Le GET l'attache à CHAQUE carte
    // (depuis data/cards/<id>.card). Tout est un `.card` → plus d'illisible.
    await Promise.all(visibleItems.map(async (it) => {
      const item = it as { id?: string; kind?: string; dotcard?: string | null };
      if (item.id && item.kind !== 'boutique') {
        const raw = await readCardFileRaw(item.id);
        if (raw) item.dotcard = raw;
      }
    }));

    // SECTION OFF → contenu coupé PARTOUT (Pascal 2026-07-05). PRINCIPE : c'est la CARD
    // qui déclare sa section via son `channel` (eat|annonce|boutique). On lit CETTE
    // déclaration — pas de rustine sur le caption. Une card dont le channel pointe une
    // section coupée est retirée. Un POST SANS channel (post social normal) n'est JAMAIS
    // masqué. Card sans `.card` non plus.
    // Résolution de section = POINT UNIQUE (lib/app-settings.resolveCardSection), partagé avec
    // les brouillons (/api/cards/mine, /api/drafts). La famille annonce (objet/immobilier/auto/
    // service/emploi) résout vers `annonces` → coupée d'un seul interrupteur ; + rencontre + pub.
    const secState = shopSectionsState();
    const sectionFilteredItems = visibleItems.filter((it) => {
      const dc = (it as { dotcard?: string | null }).dotcard;
      if (!dc) return true; // pas de .card → post normal → toujours affiché
      let sec: keyof typeof secState | null = null;
      try { const r = parseCard(dc); if (r.ok && r.card) sec = resolveCardSection(r.card as { channel?: string | null; types?: string[] }); } catch { /* */ }
      if (!sec) return true; // aucune section déclarée → post social → jamais coupé
      return secState[sec] !== false; // section OFF → on coupe
    });

    // FEED UNIQUE (Pascal 2026-07-06) : badge d'ORIGINE sur chaque post → le système dit
    // POURQUOI il est là. 'amis' (auteur = un ami) > 'autour' (auteur proche, si position
    // partagée) > 'tout' (le reste). Position via ?mylat=&mylng=.
    const friendSet = me ? new Set(listFriends(me.id).map((u) => u.id)) : new Set<string>();
    const myLat = Number(url.searchParams.get('mylat'));
    const myLng = Number(url.searchParams.get('mylng'));
    const hasPos = Number.isFinite(myLat) && Number.isFinite(myLng);
    const distKm = (la: number, lo: number) => {
      const R = 6371, dLa = ((la - myLat) * Math.PI) / 180, dLo = ((lo - myLng) * Math.PI) / 180;
      const a = Math.sin(dLa / 2) ** 2 + Math.cos((myLat * Math.PI) / 180) * Math.cos((la * Math.PI) / 180) * Math.sin(dLo / 2) ** 2;
      return 2 * R * Math.asin(Math.sqrt(a));
    };
    for (const it of sectionFilteredItems) {
      const item = it as { user_id?: string; user_lat?: number | null; user_lng?: number | null; origin?: string };
      if (item.user_id && friendSet.has(item.user_id)) item.origin = 'amis';
      else if (hasPos && typeof item.user_lat === 'number' && typeof item.user_lng === 'number' && distKm(item.user_lat, item.user_lng) <= 5) item.origin = 'autour';
      else item.origin = 'tout';
    }

    // Page-entité vivante (Pascal 2026-07-08) : si une card a un ARTICLE canonique d'entité
    // derrière, on le REFLÈTE (badge + extrait + « Lire l'article »). UNE passe sur la liste
    // finale visible (~20 items), best-effort, jamais bloquant. AJOUT SEULEMENT.
    for (const it of sectionFilteredItems) { attachEnrichment(it as { id?: string } & Record<string, unknown>); attachLyrics(it as { id?: string } & Record<string, unknown>); }

    // PLAN DE RENDU UNIQUE (Pascal 2026-07-22) : `?plan=1` → chaque item porte son `plan`
    // (enveloppe + contenu, déclaratif, sans pixels), calculé UNE fois au serveur à partir du
    // `.card`. Web ET natif peignent CE plan → même disposition, fluidité native. AJOUT SEUL.
    if (url.searchParams.get('plan') === '1') {
      for (const it of sectionFilteredItems) {
        const item = it as Record<string, unknown> & { id: string; dotcard?: string | null };
        let card: Record<string, unknown> | null = null;
        if (item.dotcard) { try { const r = parseCard(item.dotcard); if (r.ok && r.card) card = r.card as unknown as Record<string, unknown>; } catch { /* post nu */ } }
        (item as { plan?: unknown }).plan = buildFeedCardPlan({
          id: item.id,
          author: (item.author as { display_name?: string | null; username?: string | null; avatar_url?: string | null } | null) ?? null,
          postedAt: typeof item.created_at === 'number' ? item.created_at : undefined,
          likes: typeof item.likes === 'number' ? item.likes : 0,
          comment_count: typeof item.comment_count === 'number' ? item.comment_count : 0,
          share_count: typeof item.share_count === 'number' ? item.share_count : 0,
          isOwner: !!me && me.id === (item.user_id as string),
          caption: (item.caption as string | null) ?? null,
        }, card);
        // Vitrine : le PLAN porte les produits (ITEM dans le plan, peints par le lecteur unique) —
        // injectés depuis le shop côté serveur, jamais fetchés par le peintre.
        const plan = (item as { plan?: { content?: { shopId?: string; products?: unknown; shopKind?: string } } }).plan;
        if (plan?.content?.shopId) {
          try {
            const shop = getSimpleShop(plan.content.shopId);
            if (shop) {
              plan.content.shopKind = shop.kind || 'boutique';
              plan.content.products = listItems(shop.id).slice(0, 12).map((p) => ({
                id: p.id,
                image: p.image_url || undefined,
                title: p.label || 'Article',
                price: (p.price_cents != null && p.price_cents > 0) ? `${p.price_cents} MGA` : undefined,
              }));
            }
          } catch { /* best-effort : jamais bloquer le feed */ }
        }
      }
    }

    // Rétrocompat : on garde aussi posts[] (les clients legacy continuent de tourner)
    const posts = getPosts(limit);
    return NextResponse.json({
      items: sectionFilteredItems,
      posts: posts.map(toPostResponse),
    });
  } catch (err) {
    console.error('[posts] GET error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
