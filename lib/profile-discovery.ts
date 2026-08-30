/* eslint-disable @typescript-eslint/no-explicit-any */
import 'server-only';
/**
 * Profil « Discovery » (Pascal 2026-08-30) — agrège la VIE T2M d'une personne à partir de l'existant
 * (espace Card), sans nouvelle donnée : ses publications, sa musique, ses œuvres, ses boutiques/fiches,
 * ses coups de cœur (likes). Rendu magazine + SEO. Tout est déjà là, on ré-assemble et on met en scène.
 */
import { getUserByUsername } from '@/lib/db-users';
import { countFriends } from '@/lib/db-friendships';
import { getFeedFromCards, getCardFeedItem } from '@/lib/cards/feed-from-cards';
import { getUserLikedCards } from '@/lib/db';
import { listSimpleShops, listMyEatShops, listMyPlatMaison, getShopVitrinePostId } from '@/lib/simple-shop';
import { listUserPhotos, type UserPhoto } from '@/lib/user-photos';

export interface DiscoveryFiche { id: string; name: string; kind: string; cover: string | null; href: string | null; card_id: string | null; preview_item: unknown }
export interface ProfileDiscovery {
  user: { id: string; username: string; display_name: string | null; avatar_url: string | null; cover: string | null; tagline: string | null; friends_count: number; created_at: number } | null;
  photos: UserPhoto[];
  publications: unknown[];
  music: unknown[];
  works: unknown[];
  boutiques: DiscoveryFiche[];
  likes: unknown[];
}

const isMusic = (it: any) => !!it && (it.layout === 'album' || it.layout === 'audio' || !!it.attached_audio_json);
const isWork = (it: any) => !!it && (it.layout === 'film' || it.layout === 'video');

export function getProfileDiscovery(username: string, viewerId?: string): ProfileDiscovery {
  const u = getUserByUsername(username);
  if (!u) return { user: null, photos: [], publications: [], music: [], works: [], boutiques: [], likes: [] };

  // Toutes ses cards publiées → items feed (lecteur unique), facettées.
  const all = getFeedFromCards(60, 0, { authorIds: [u.id], meId: viewerId, excludeLabo: true }) as any[];
  const music = all.filter(isMusic);
  const works = all.filter((it) => isWork(it) && !isMusic(it));
  const used = new Set<string>([...music, ...works].map((x) => String(x.id)));
  const publications = all.filter((it) => !used.has(String(it.id))).slice(0, 24);

  // Fiches (boutique + eat + plat) → mini-feed via card vitrine.
  const ficheHit = (id: string, name: string, kind: string, cover: string | null, key: string | null): DiscoveryFiche => {
    const cardId = getShopVitrinePostId(id);
    let preview: unknown = null;
    if (cardId) { try { preview = getCardFeedItem(cardId, viewerId); } catch { /* */ } }
    return { id, name, kind, cover, href: key ? `/b/${key}` : null, card_id: cardId, preview_item: preview };
  };
  const boutiques: DiscoveryFiche[] = [
    ...listSimpleShops(u.id).map((s) => ficheHit(s.id, s.name, 'boutique', s.cover_url ?? null, s.public_key ?? null)),
    ...listMyEatShops(u.id).map((s: any) => ficheHit(s.id, s.name, 'eat', s.cover_url ?? null, s.public_key ?? null)),
    ...listMyPlatMaison(u.id).map((s) => ficheHit(s.id, s.name, 'plat_maison', s.cover_url ?? null, s.public_key ?? null)),
  ];

  // Coups de cœur (goûts publics — décision produit Pascal 2026-08-30 : le Discovery montre les likes).
  const liked = getUserLikedCards(u.id, 24, 0) as any[];
  const likes = liked.map((c) => { try { return getCardFeedItem(String(c.id ?? c.card_id), viewerId); } catch { return null; } }).filter(Boolean);

  return {
    user: {
      id: u.id, username: u.username, display_name: u.display_name, avatar_url: u.avatar_url,
      cover: (u as any).room_photo ?? null, tagline: (u as any).room_tagline ?? null,
      friends_count: countFriends(u.id), created_at: (u as any).created_at ?? 0,
    },
    photos: listUserPhotos(u.id),
    publications, music, works, boutiques, likes,
  };
}
