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
function cardToFeedItem(sc: SuperCard, author: unknown) {
  // Bascule #2 (flag SUPERCARD_FEED_V2, OFF par défaut) : les hints d'affichage (type/kind/média/légende)
  // viennent du LECTEUR UNIQUE (contexte `feed`) ; sinon dérivation legacy. Les deux coexistent → zéro impact off.
  const v2 = process.env.SUPERCARD_FEED_V2 === '1'
    ? (() => { try { return feedDisplayV2(convertV1toV2(sc as unknown as Parameters<typeof convertV1toV2>[0])); } catch { return null; /* garde-fou : toute erreur v2 → legacy */ } })()
    : null;
  const types = Array.isArray(sc.types) ? sc.types : [];
  const type = v2 ? v2.type : (types.includes('video') || sc.video ? 'video' : types.includes('image') || (sc.images && sc.images.length) ? 'image' : 'texte');
  const kind = v2 ? v2.kind : (type === 'video' ? 'video_card' : type === 'image' ? 'image_card' : 'texte_card');
  const media_url = v2 ? v2.media_url : (sc.video?.url || sc.images?.[0] || null);
  // Anti-désintermédiation : masque un n° de téléphone glissé dans la légende (feed web + natif).
  const caption = maskContactInfo(v2 ? v2.caption : (sc.text?.body || sc.title || null));
  // Reconstruit un attached_audio minimal (le feed lit video_id pour détecter le son).
  const vid = ytId(sc.audio?.embed);
  const attached_audio_json = vid
    ? JSON.stringify({ source: 'youtube', video_id: vid, title: sc.title || '', embed: { src: sc.audio!.embed } })
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
    author: author ?? null,
    attached_audio_json,
    attached_product_json,
    dotcard: serializeCard(sc),
  };
}

export interface FeedFromCardsOpts {
  authorIds?: string[];      // scope=friends → seulement ces auteurs
  commerceOnly?: boolean;    // scope=shop → seulement les cards commerce
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
  return cards.map((sc) => cardToFeedItem(sc, authorOf(sc.owner || '')));
}
