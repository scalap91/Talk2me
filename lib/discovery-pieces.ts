import 'server-only';
/**
 * Pièces GRANULAIRES du Discovery (Pascal 2026-08-30) — chaque « type » de contenu d'un profil, exposé
 * séparément pour que le NATIF assemble Discovery par endpoints (option B). MÊMES fonctions serveur que
 * la page web SSR (getFeedFromCardsRanked, getScoredTracks, getUserLikedCards, listSimpleShops…) → même
 * donnée, zéro divergence. Chaque pièce renvoie des COUVERTURES déjà dérivées (deriveCover) prêtes à rendre.
 */
import { getFeedFromCardsRanked, getCardFeedItem } from '@/lib/cards/feed-from-cards';
import { getUserLikedCards } from '@/lib/db';
import { getScoredTracks } from '@/lib/memory-score';
import { listSimpleShops, listMyEatShops, listMyPlatMaison, getShopVitrinePostId, listTopSellingItemsForOwner } from '@/lib/simple-shop';
import { listUserPhotos } from '@/lib/user-photos';
import { getSavedCards } from '@/lib/db-saved-cards';
import { deriveCover, type DiscoveryCover } from '@/lib/discovery-cover';

/* eslint-disable @typescript-eslint/no-explicit-any */
const isMusic = (it: any) => !!it && (it.layout === 'album' || it.layout === 'audio' || !!it.attached_audio_json);
const isWork = (it: any) => !!it && (it.layout === 'film' || it.layout === 'video');
const ytIdOf = (it: any): string | null => {
  try {
    const a = JSON.parse(it.attached_audio_json || '{}');
    return (String(a.external_url || '').match(/[?&]v=([\w-]{6,})/) || String(a.thumbnail_url || '').match(/\/vi\/([\w-]{6,})\//) || [])[1] || null;
  } catch { return null; }
};

export interface CardsFacets { music: DiscoveryCover[]; works: DiscoveryCover[]; publications: DiscoveryCover[] }
export interface CardsItems { music: any[]; works: any[]; publications: any[] }

/** Cards publiées de l'utilisateur en ITEMS de feed COMPLETS, facettées (music/works/publications),
 *  musique réordonnée par le système de points — MÊME source/ordre que la page web SSR. Le natif rend
 *  ces items par LE LECTEUR UNIQUE (ImmersiveFeedCard), identique à AlignedPostCard côté web. */
export function userCardsItems(userId: string, viewerId?: string): CardsItems {
  const all = getFeedFromCardsRanked(60, 0, { authorIds: [userId], meId: viewerId, excludeLabo: true }) as any[];
  const works = all.filter((it) => isWork(it) && !isMusic(it));
  let music = all.filter(isMusic);
  try {
    const scored = getScoredTracks(userId, Date.now(), 80);
    if (scored.length) {
      const s = new Map(scored.map((t) => [t.youtube_video_id, t.score]));
      music = [...music].sort((a, b) => (s.get(ytIdOf(b) || '') || 0) - (s.get(ytIdOf(a) || '') || 0));
    }
  } catch { /* pas d'écoutes → ordre engagement */ }
  const used = new Set<string>([...music, ...works].map((x) => String(x.id)));
  const publications = all.filter((it) => !used.has(String(it.id))).slice(0, 24);
  return { music, works, publications };
}

/** Idem mais en COUVERTURES (deriveCover) — conservé pour les usages « index ». */
export function userCardsFacets(userId: string, viewerId?: string): CardsFacets {
  const { music, works, publications } = userCardsItems(userId, viewerId);
  return { music: music.map(deriveCover), works: works.map(deriveCover), publications: publications.map(deriveCover) };
}

/** Coups de cœur (cards likées) → couvertures. */
export function userLikesCovers(userId: string, viewerId?: string): DiscoveryCover[] {
  const liked = getUserLikedCards(userId, 24, 0) as any[];
  return liked.map((c) => { try { return getCardFeedItem(String(c.id ?? c.card_id), viewerId); } catch { return null; } }).filter(Boolean).map(deriveCover);
}

export interface ShopCover extends DiscoveryCover { href: string | null }
/** Boutiques / fiches (boutique + eat + plat) → couvertures avec lien /b/<clé>. */
export function userShopsCovers(userId: string): ShopCover[] {
  const mk = (id: string, name: string, cover: string | null, key: string | null): ShopCover => {
    const cardId = getShopVitrinePostId(id);
    return { id: cardId || id, image: cover, title: name, subtitle: 'Boutique', kind: 'boutique', emoji: '🛍️', accent: '#FF7F11', href: key ? `/b/${key}` : null };
  };
  return [
    ...listSimpleShops(userId).map((s) => mk(s.id, s.name, s.cover_url ?? null, s.public_key ?? null)),
    ...listMyEatShops(userId).map((s: any) => mk(s.id, s.name, s.cover_url ?? null, s.public_key ?? null)),
    ...listMyPlatMaison(userId).map((s) => mk(s.id, s.name, (s as any).cover_url ?? null, (s as any).public_key ?? null)),
  ];
}

export interface ShopWithPreview { id: string; name: string; cover: string | null; href: string | null; card_id: string | null; preview_item: any }
/** Boutiques + l'ITEM de feed de leur vitrine (preview_item) → le natif rend la boutique par LE LECTEUR
 *  UNIQUE (ImmersiveFeedCard), identique au web (getProfileDiscovery.boutiques). */
export function userShopsWithPreview(userId: string, viewerId?: string): ShopWithPreview[] {
  const mk = (id: string, name: string, cover: string | null, key: string | null): ShopWithPreview => {
    const cardId = getShopVitrinePostId(id);
    let preview: any = null;
    if (cardId) { try { preview = getCardFeedItem(cardId, viewerId); } catch { /* */ } }
    return { id, name, cover, href: key ? `/b/${key}` : null, card_id: cardId, preview_item: preview };
  };
  return [
    ...listSimpleShops(userId).map((s) => mk(s.id, s.name, s.cover_url ?? null, s.public_key ?? null)),
    ...listMyEatShops(userId).map((s: any) => mk(s.id, s.name, s.cover_url ?? null, s.public_key ?? null)),
    ...listMyPlatMaison(userId).map((s) => mk(s.id, s.name, (s as any).cover_url ?? null, (s as any).public_key ?? null)),
  ];
}

export interface BestSellerCover extends ShopCover { price_cents: number | null; sold: number; shop_name: string }
/** Meilleures ventes (colonne sold) → couvertures « 🔥 N vendus » AVEC prix + vendus (grille articles). */
export function userBestSellersCovers(userId: string): BestSellerCover[] {
  return listTopSellingItemsForOwner(userId, 8).map((t) => ({
    id: t.card_id || t.id, image: t.image, title: t.title,
    subtitle: `${t.sold} vendu${t.sold > 1 ? 's' : ''}`, kind: 'produit', emoji: '🔥', accent: '#FF3D2E',
    href: t.shop_key ? `/b/${t.shop_key}` : null,
    price_cents: t.price_cents, sold: t.sold, shop_name: t.shop_name,
  }));
}

/** Photos perso. */
export function userPhotosList(userId: string) {
  return listUserPhotos(userId).map((p) => ({ id: p.id, url: p.url, caption: p.caption }));
}

export interface SavedItem { id: string; title: string; kind: string; cover: string | null; cardId: string | null }
/** Pages enregistrées : ce que la personne garde. Couverture best-effort via deriveCover ; un tap ouvre
 *  le lecteur unique sur le .card (cardId). */
export function userSavedList(userId: string, limit = 24): SavedItem[] {
  return getSavedCards(userId, limit, 0).map((s) => {
    let cover: string | null = null; let cardId: string | null = null; let dTitle = '';
    try { const c = deriveCover(s.card_data); cover = c.image; cardId = c.id ? String(c.id) : null; dTitle = c.title; } catch { /* repli titre */ }
    return { id: s.id, title: s.title || dTitle || 'Enregistré', kind: String(s.card_kind || ''), cover, cardId };
  });
}
