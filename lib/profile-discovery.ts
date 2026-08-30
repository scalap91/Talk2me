/* eslint-disable @typescript-eslint/no-explicit-any */
import 'server-only';
/**
 * Profil « Discovery » (Pascal 2026-08-30) — agrège la VIE T2M d'une personne à partir de l'existant
 * (espace Card), sans nouvelle donnée : ses publications, sa musique, ses œuvres, ses boutiques/fiches,
 * ses coups de cœur (likes). Rendu magazine + SEO. Tout est déjà là, on ré-assemble et on met en scène.
 */
import { getUserByUsername } from '@/lib/db-users';
import { countFriends } from '@/lib/db-friendships';
import { getFeedFromCardsRanked, getCardFeedItem } from '@/lib/cards/feed-from-cards';
import { getUserLikedCards } from '@/lib/db';
import { getScoredTracks, getGenreScores, getTopArtist } from '@/lib/memory-score';
import { deriveCover } from '@/lib/discovery-cover';
import { getCachedDiscoveryAI, ensureDiscoveryAI, type DiscoveryAI, type DiscoveryAIContext } from '@/lib/discovery-ai';
import { createHash } from 'crypto';
import { listSimpleShops, listMyEatShops, listMyPlatMaison, getShopVitrinePostId, listTopSellingItemsForOwner } from '@/lib/simple-shop';
import { listUserPhotos, type UserPhoto } from '@/lib/user-photos';
import { userSavedList } from '@/lib/discovery-pieces';

export interface DiscoveryFiche { id: string; name: string; kind: string; cover: string | null; href: string | null; card_id: string | null; preview_item: unknown }
export interface DiscoveryBestSeller { id: string; image: string | null; title: string; subtitle: string; href: string | null; price_cents: number | null; sold: number; shop_name: string }
export interface DiscoverySaved { id: string; title: string; kind: string; cover: string | null; cardId: string | null }
export interface ProfileDiscovery {
  user: { id: string; username: string; display_name: string | null; avatar_url: string | null; cover: string | null; tagline: string | null; friends_count: number; created_at: number } | null;
  photos: UserPhoto[];
  publications: unknown[];
  music: unknown[];
  works: unknown[];
  boutiques: DiscoveryFiche[];
  bestSellers: DiscoveryBestSeller[];
  saved: DiscoverySaved[];
  likes: unknown[];
  ai: DiscoveryAI | null;
}

const isMusic = (it: any) => !!it && (it.layout === 'album' || it.layout === 'audio' || !!it.attached_audio_json);
const isWork = (it: any) => !!it && (it.layout === 'film' || it.layout === 'video');

export function getProfileDiscovery(username: string, viewerId?: string): ProfileDiscovery {
  const u = getUserByUsername(username);
  if (!u) return { user: null, photos: [], publications: [], music: [], works: [], boutiques: [], bestSellers: [], saved: [], likes: [], ai: null };

  // Toutes ses cards publiées, DÉJÀ CLASSÉES par engagement (likes×3+comments×4+shares×5+views×0.5,
  // décroissance temps, boostés en tête) → le meilleur contenu remonte en tête de chaque thème.
  const all = getFeedFromCardsRanked(60, 0, { authorIds: [u.id], meId: viewerId, excludeLabo: true }) as any[];
  const works = all.filter((it) => isWork(it) && !isMusic(it));

  // MUSIQUE : on réordonne ses sons avec le SYSTÈME DE POINTS (memory-score) — le son le plus écouté
  // par la personne remonte en tête, comme dans la music-card. Repli sur l'ordre engagement si pas d'écoutes.
  const music0 = all.filter(isMusic);
  let music = music0;
  try {
    const scored = getScoredTracks(u.id, Date.now(), 80);
    if (scored.length) {
      const scoreOf = new Map(scored.map((s) => [s.youtube_video_id, s.score]));
      const vidOf = (it: any): string | null => {
        try {
          const a = JSON.parse(it.attached_audio_json || '{}');
          return (String(a.external_url || '').match(/[?&]v=([\w-]{6,})/) || String(a.thumbnail_url || '').match(/\/vi\/([\w-]{6,})\//) || [])[1] || null;
        } catch { return null; }
      };
      music = [...music0].sort((a, b) => (scoreOf.get(vidOf(b) || '') || 0) - (scoreOf.get(vidOf(a) || '') || 0));
    }
  } catch { /* pas d'écoutes → ordre engagement */ }
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

  // MEILLEURES VENTES : ses produits les plus vendus (colonne sold), toutes boutiques confondues.
  // On conserve prix + vendus + boutique : le chapitre boutique du Discovery affiche la grille d'articles.
  const bestSellers = listTopSellingItemsForOwner(u.id, 8).map((t) => ({
    id: t.card_id || t.id,
    image: t.image,
    title: t.title,
    subtitle: `${t.sold} vendu${t.sold > 1 ? 's' : ''}`,
    href: t.shop_key ? `/b/${t.shop_key}` : null,
    price_cents: t.price_cents,
    sold: t.sold,
    shop_name: t.shop_name,
  }));

  // PAGES ENREGISTRÉES (Pascal 2026-08-30) : ce que la personne garde près d'elle. MÊME fonction que
  // l'endpoint natif /api/users/[username]/saved → zéro divergence (le .card reste la source).
  const saved = userSavedList(u.id, 24);

  // Coups de cœur (goûts publics — décision produit Pascal 2026-08-30 : le Discovery montre les likes).
  const liked = getUserLikedCards(u.id, 24, 0) as any[];
  const likes = liked.map((c) => { try { return getCardFeedItem(String(c.id ?? c.card_id), viewerId); } catch { return null; } }).filter(Boolean);

  // COUCHE IA (cache-first) : portrait + accroches, à partir des données réelles. Le SSR sert le CACHE ;
  // si le contenu a changé, la régénération part EN FOND (non bloquante). Repli : libellés statiques.
  const titlesOf = (arr: unknown[], n: number) => arr.slice(0, n).map((it) => deriveCover(it).title).filter(Boolean);
  const ctx: DiscoveryAIContext = {
    name: u.display_name || u.username,
    topGenres: (() => { try { return getGenreScores(u.id, Date.now(), 5).map((g: any) => g.genre).filter(Boolean); } catch { return []; } })(),
    topArtist: (() => { try { return getTopArtist(u.id, Date.now()); } catch { return null; } })(),
    titles: {
      music: titlesOf(music, 5), works: titlesOf(works, 5), pub: titlesOf(publications, 6),
      likes: titlesOf(likes, 5), shops: boutiques.slice(0, 5).map((b) => b.name),
    },
    counts: { music: music.length, works: works.length, pub: publications.length, likes: likes.length, shops: boutiques.length },
  };
  const sig = createHash('sha1').update(JSON.stringify(ctx)).digest('hex').slice(0, 16);
  let ai: DiscoveryAI | null = null;
  try { ai = getCachedDiscoveryAI(u.id); ensureDiscoveryAI(u.id, sig, ctx); } catch { /* IA best-effort */ }

  return {
    user: {
      id: u.id, username: u.username, display_name: u.display_name, avatar_url: u.avatar_url,
      cover: (u as any).room_photo ?? null, tagline: (u as any).room_tagline ?? null,
      friends_count: countFriends(u.id), created_at: (u as any).created_at ?? 0,
    },
    photos: listUserPhotos(u.id),
    publications, music, works, boutiques, bestSellers, saved, likes, ai,
  };
}
