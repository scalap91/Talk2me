import 'server-only';
/**
 * UNIFICATION Card OS (Pascal 2026-07-12) — LECTURE DU FEED DEPUIS `cards`.
 *
 * Cible validée : la table `cards` = source de vérité ; le `.card` = sa projection. Ici on lit le
 * feed DIRECTEMENT depuis `cards` (via cardRepository.query) et on produit des items au MÊME format
 * que `directCardToItem` (route posts), pour que le rendu (AlignedPostCard) marche sans rien changer.
 * Le `.card` sérialisé sert de `dotcard` (source de rendu). On RECONSTRUIT `attached_audio_json`
 * depuis `audio.embed` (sinon les cards-son ne détectent plus le son au feed).
 *
 * Branché derrière `?src=cards` tant que la bascule n'est pas validée → zéro impact sur le feed live.
 */
import { getDb } from '@/lib/db';
import { searchCards } from '@/lib/db-posts';
import { cardRepository } from '@/lib/cards/engine/card.repository';
import { serializeCard, type SuperCard } from '@/lib/cards/supercard';
import { feedDisplayV2 } from '@/lib/cards/v2/reader/feed';
import { convertV1toV2 } from '@/lib/cards/v2/convert';
import { deriveLayout } from '@/lib/cards/v2/reader/services';
import { maskContactInfo } from '@/lib/cards/contact-guard';

function ytId(u?: string | null): string | null {
  if (!u) return null;
  const m = u.match(/(?:v=|\/embed\/|youtu\.be\/)([A-Za-z0-9_-]{6,20})/);
  return m ? m[1] : null;
}

/** SuperCard (table cards) → item de feed, format identique à directCardToItem. */
function cardToFeedItem(sc: SuperCard, author: unknown, meId?: string) {
  // Bascule #2 (flag SUPERCARD_FEED_V2, OFF par défaut) : les hints d'affichage (type/kind/média/légende)
  // viennent du LECTEUR UNIQUE (contexte `feed`) ; sinon dérivation legacy. Les deux coexistent → zéro impact off.
  const v2 = process.env.SUPERCARD_FEED_V2 === '1'
    ? (() => { try { return feedDisplayV2(convertV1toV2(sc as unknown as Parameters<typeof convertV1toV2>[0])); } catch { return null; /* garde-fou : toute erreur v2 → legacy */ } })()
    : null;
  const types = Array.isArray(sc.types) ? sc.types : [];
  const type = v2 ? v2.type : (types.includes('video') || sc.video ? 'video' : types.includes('image') || (sc.images && sc.images.length) ? 'image' : 'texte');
  const kind = v2 ? v2.kind : (type === 'video' ? 'video_card' : type === 'image' ? 'image_card' : 'texte_card');
  // media_url = média UPLOADÉ (photo/vidéo PERSO), JAMAIS un embed (YouTube…). L'embed du son/vidéo
  // passe par topEmbed/attached_audio dans le lecteur. Régression (Pascal 2026-08-14) : le reader v2
  // renvoyait l'URL d'embed comme media → AlignedPostCard la fourrait dans `<video src=embed>` (=écran
  // NOIR sous la vidéo, texte enrichi masqué). Le legacy donnait null → on rétablit ce comportement.
  const rawMedia = v2 ? v2.media_url : (sc.video?.url || sc.images?.[0] || null);
  const media_url = rawMedia && /(?:youtube\.com|youtu\.be|\/embed\/|player\.vimeo|dailymotion)/i.test(rawMedia) ? null : rawMedia;
  // Anti-désintermédiation : masque un n° de téléphone glissé dans la légende (feed web + natif).
  const caption = maskContactInfo(v2 ? v2.caption : (sc.text?.body || sc.title || null));
  // Reconstruit attached_audio dans une forme COMPATIBLE DOUBLE-LECTEUR (Pascal 2026-08-14) :
  //  • NATIF lit `video_id` (détection du son) + `audio.embed` du .card ;
  //  • WEB (PostShell.musicAudio) exige `type:'audio'` + `external_url`/`thumbnail_url`/`author.name`
  //    pour afficher le DISQUE musique (MusicDiscCard). Sans ces champs, `musicAudio` renvoyait null
  //    → la card musique tombait en texte SANS média → CORPS BLANC (régression de l'unification `cards`).
  const vid = ytId(sc.audio?.embed);
  const attached_audio_json = vid
    ? JSON.stringify({
        type: 'audio',
        source: 'youtube',
        video_id: vid,
        title: sc.audio?.title || sc.title || '',
        author: { name: sc.audio?.author || '' },
        thumbnail_url: sc.audio?.thumbnail || `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`,
        external_url: sc.audio?.external_url || `https://www.youtube.com/watch?v=${vid}`,
        embed: { src: sc.audio!.embed },
      })
    : null;
  // Produit attaché : porté par les `items` imbriqués du .card (reconstruit plus tard si besoin).
  const attached_product_json = null;
  // LECTEUR UNIQUE côté natif : le serveur calcule l'archétype de rendu (album/film/video/boutique/
  // photo…) UNE fois ; le Flutter le PEINT au lieu de le re-deviner en Dart. Défensif (jamais throw).
  const layout = (() => { try { return deriveLayout(convertV1toV2(sc as unknown as Parameters<typeof convertV1toV2>[0])); } catch { return undefined; } })();
  return {
    kind,
    layout,
    id: sc.id,
    user_id: sc.owner,
    type,
    media_url,
    caption,
    text: type === 'texte' ? caption : null,
    bg_variant: null,
    post_type: (sc.channel as string) ?? null,
    createdAt: sc.createdAt ?? Date.now(),
    created_at: sc.createdAt ?? Date.now(),
    likes: 0,
    views: 0,
    card_kind: 'direct_card' as const,
    share_count: 0,
    comment_count: 0,
    // PROPRIÉTÉ RÉELLE : le post est-il à MOI ? (user courant === owner de la carte). Web lit is_owner,
    // natif lit mine. → « Créé par moi » / « Regarder mon film » n'apparaît que si c'est VRAIMENT à moi.
    is_owner: !!meId && meId === sc.owner,
    mine: !!meId && meId === sc.owner,
    author: author ?? null,
    attached_audio_json,
    attached_product_json,
    dotcard: serializeCard(sc),
  };
}

export interface FeedFromCardsOpts {
  authorIds?: string[];      // scope=friends → seulement ces auteurs
  commerceOnly?: boolean;    // scope=shop → seulement les cards commerce
  meId?: string;             // user courant → is_owner/mine (« Créé par moi ») calculé pour de vrai
}

/** Feed lu depuis `cards` (source de vérité), paginé. Source UNIQUE du feed (unification Card OS). */
export function getFeedFromCards(limit: number, offset: number, opts: FeedFromCardsOpts = {}) {
  // On sur-échantillonne pour pouvoir filtrer scope en JS sans casser la pagination.
  const pool = cardRepository.query({ limit: (opts.authorIds || opts.commerceOnly) ? 500 : limit, offset, state: 'published' });
  const isCommerce = (sc: SuperCard) => sc.channel === 'boutique' || (Array.isArray(sc.types) && sc.types.some((t) => t === 'product' || t === 'listing'));
  let cards = pool;
  if (opts.authorIds) { const set = new Set(opts.authorIds); cards = cards.filter((sc) => set.has(sc.owner || '')); }
  if (opts.commerceOnly) cards = cards.filter(isCommerce);
  cards = cards.slice(0, limit);
  const db = getDb();
  const authorOf = (owner: string) => {
    try {
      return db.prepare('SELECT id, display_name, username, avatar_url FROM users WHERE id = ?').get(owner) ?? null;
    } catch {
      return null;
    }
  };
  return cards.map((sc) => cardToFeedItem(sc, authorOf(sc.owner || ''), opts.meId));
}

/** UNE card (n'importe quel auteur, publiée) → item de feed (avec `dotcard`, forme /api/posts).
 *  Sert à ouvrir une card d'AUTRUI (ex. onglet Likées) dans le viewer /mes-cards via le LECTEUR
 *  UNIQUE (AlignedPostCard), sans « card introuvable ». Pascal 2026-08-14. */
export function getCardFeedItem(id: string, meId?: string) {
  const sc = cardRepository.findById(id);
  if (!sc || sc.state !== 'published') return null;
  const db = getDb();
  const author = (() => { try { return db.prepare('SELECT id, display_name, username, avatar_url FROM users WHERE id = ?').get(sc.owner || '') ?? null; } catch { return null; } })();
  return cardToFeedItem(sc, author, meId);
}

/**
 * FEED UNIFIÉ (Pascal 2026-08-14) — lu depuis `cards` (source unique) + CLASSEMENT engagement+fraîcheur.
 * MÊME formule de score que le web legacy (getMixedFeedRankedPage) → web ET natif = même feed.
 * La table `cards` ne porte pas l'engagement → on le JOINT : likes (card_likes), commentaires
 * (card_comments), vues/partages/boost (direct_cards pour les cards qui en ont une ligne miroir).
 */
export function getFeedFromCardsRanked(limit: number, offset: number, opts: FeedFromCardsOpts = {}) {
  const db = getDb();
  const now = Date.now();
  const POOL = 800; // on classe les 800 cards les plus récentes (comme le legacy)
  const rows = db.prepare(
    `SELECT c.id, c.owner, c.created_at,
        (SELECT COUNT(*) FROM card_likes WHERE card_id = c.id) AS likes,
        (SELECT COUNT(*) FROM card_comments WHERE card_id = c.id) AS comments,
        COALESCE(d.views, 0) AS views,
        COALESCE(d.share_count, 0) AS shares,
        COALESCE(d.boosted_until, 0) AS boost
       FROM cards c
       LEFT JOIN direct_cards d ON d.id = c.id
      WHERE c.state = 'published' AND c.deleted_at IS NULL
      ORDER BY c.created_at DESC LIMIT ?`,
  ).all(POOL) as Array<{ id: string; owner: string; created_at: number; likes: number; comments: number; views: number; shares: number; boost: number }>;

  // Score IDENTIQUE au web (engagement pondéré / (âge+2)^1.5, date future = ancienne).
  const score = (likes: number, comments: number, shares: number, views: number, createdAt: number): number => {
    const eng = likes * 3 + comments * 4 + shares * 5 + views * 0.5;
    const rawAgeH = (now - createdAt) / 3_600_000;
    const ageH = rawAgeH < -1 ? 9999 : Math.max(0, rawAgeH);
    return (1 + eng) / Math.pow(ageH + 2, 1.5);
  };

  let ranked = rows.map((r) => ({ ...r, s: score(r.likes, r.comments, r.shares, r.views, r.created_at) }));
  if (opts.authorIds) { const set = new Set(opts.authorIds); ranked = ranked.filter((r) => set.has(r.owner)); } // scope Amis
  ranked.sort((a, b) => {
    const ba = a.boost > now ? 1 : 0, bb = b.boost > now ? 1 : 0;
    if (ba !== bb) return bb - ba; // boostés d'abord
    return b.s - a.s || b.created_at - a.created_at;
  });

  const authorOf = (owner: string): unknown => {
    try { return db.prepare('SELECT id, display_name, username, avatar_url FROM users WHERE id = ?').get(owner) ?? null; } catch { return null; }
  };
  const isCommerce = (sc: SuperCard) => sc.channel === 'boutique' || (Array.isArray(sc.types) && sc.types.some((t) => t === 'product' || t === 'listing'));
  const out: ReturnType<typeof cardToFeedItem>[] = [];
  for (const r of ranked) {
    const sc = cardRepository.findById(r.id);
    if (!sc || sc.state === 'archived') continue;
    if (opts.commerceOnly && !isCommerce(sc)) continue; // scope Shop
    // Engagement RÉEL injecté (cardToFeedItem le laisse à 0).
    out.push({ ...cardToFeedItem(sc, authorOf(sc.owner || ''), opts.meId), likes: r.likes, views: r.views, share_count: r.shares, comment_count: r.comments });
  }
  return out.slice(offset, offset + limit);
}

/**
 * RECHERCHE (Pascal 2026-07-27) — le VRAI moteur exposé à Découvrir / au feed.
 * `searchCards` (FTS5 BM25 sur card_search) → ids → cards de la table `cards` (source de vérité)
 * via `cardRepository.findById` → `cardToFeedItem` → items de feed, dans l'ordre du rang.
 * MÊME convertisseur que le feed → même lecteur unique. Remplace le filtre « top-60 populaire côté client ».
 */
export function searchCardsFeed(query: string, limit = 30, meId?: string) {
  const hits = searchCards(query, limit);
  if (!hits.length) return [];
  const db = getDb();
  const authorOf = (owner: string) => {
    try { return db.prepare('SELECT id, display_name, username, avatar_url FROM users WHERE id = ?').get(owner) ?? null; } catch { return null; }
  };
  const out: ReturnType<typeof cardToFeedItem>[] = [];
  for (const h of hits) {
    const sc = cardRepository.findById(h.post_id); // ids d'index absents/périmés → simplement ignorés
    if (sc && sc.state !== 'archived') out.push(cardToFeedItem(sc, authorOf(sc.owner || ''), meId));
  }
  return out;
}
