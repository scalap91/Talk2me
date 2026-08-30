import 'server-only';
/**
 * buildDiscoveryScenes (Pascal 2026-08-30) — construit les SCÈNES du Discovery côté SERVEUR, avec les
 * couvertures déjà dérivées (deriveCover) et l'ordre déjà appliqué. Sert la route native /api/discovery :
 * le natif Flutter rend « bêtement » ces scènes (réplique EXACTE du web). MÊME logique de facettage/ordre
 * que le lecteur web (ProfileDiscoveryClient), centralisée ici pour éviter la divergence. Le .card reste
 * la source ; ceci n'est qu'un index de couvertures.
 */
import { getProfileDiscovery } from '@/lib/profile-discovery';
import { deriveCover, type DiscoveryCover } from '@/lib/discovery-cover';

export interface SceneCover extends DiscoveryCover { href?: string | null }
export interface DiscoveryScene { key: string; kicker: string; line: string; music: boolean; covers: SceneCover[]; encourage?: string }
export interface DiscoveryScenesPayload {
  user: { id: string; username: string; display_name: string | null; avatar_url: string | null; cover: string | null; tagline: string | null; friends_count: number } | null;
  portrait: string;
  scenes: DiscoveryScene[];
  photos: { id: string; url: string; caption: string | null }[];
}

export function buildDiscoveryScenes(username: string, viewerId?: string, viewerIsSelf = false): DiscoveryScenesPayload {
  const data = getProfileDiscovery(username, viewerId);
  const u = data.user;
  if (!u) return { user: null, portrait: '', scenes: [], photos: [] };

  const name = u.display_name || u.username;
  const music = (data.music as unknown[]).map(deriveCover) as SceneCover[];
  const works = (data.works as unknown[]).map(deriveCover) as SceneCover[];
  const publications = (data.publications as unknown[]).map(deriveCover) as SceneCover[];
  const likes = (data.likes as unknown[]).map(deriveCover) as SceneCover[];
  const shops: SceneCover[] = data.boutiques.map((b) => ({ id: b.card_id || b.id, image: b.cover, title: b.name, subtitle: 'Boutique', kind: 'boutique', emoji: '🛍️', accent: '#FF7F11', href: b.href }));
  const bestSellers: SceneCover[] = (data.bestSellers || []).map((b) => ({ id: b.id, image: b.image, title: b.title, subtitle: b.subtitle, kind: 'produit', emoji: '🔥', accent: '#FF3D2E', href: b.href }));

  const scenes: DiscoveryScene[] = [];
  if (music.length) scenes.push({ key: 'music', kicker: 'Son hymne', line: 'Ce qu’il écoute, là', music: true, covers: music });
  if (works.length) scenes.push({ key: 'works', kicker: 'À l’écran', line: 'Ce qui le fait vibrer', music: false, covers: works });
  if (publications.length) scenes.push({ key: 'pub', kicker: 'Sa plume', line: 'Ce qu’il raconte', music: false, covers: publications });
  if (likes.length) scenes.push({ key: 'likes', kicker: 'Ses goûts', line: 'Ce qu’il aime', music: false, covers: likes });
  if (shops.length) scenes.push({ key: 'shops', kicker: 'Son commerce', line: 'Ce qu’il propose', music: false, covers: shops });
  if (bestSellers.length) scenes.push({ key: 'best', kicker: 'Best-sellers', line: 'Ses meilleures ventes', music: false, covers: bestSellers });
  else if (shops.length) scenes.push({ key: 'best', kicker: 'Best-sellers', line: 'Ses meilleures ventes', music: false, covers: [], encourage: viewerIsSelf ? 'Tes premières ventes s’afficheront ici. Partage ta boutique pour lancer la machine.' : `Aucune vente pour l’instant — sois le premier à commander chez ${name}, ta commande s’affichera ici.` });

  const bits: string[] = [];
  if (publications.length) bits.push(`${publications.length} publication${publications.length > 1 ? 's' : ''}`);
  if (music.length) bits.push(`${music.length} son${music.length > 1 ? 's' : ''}`);
  if (works.length) bits.push(`${works.length} vidéo${works.length > 1 ? 's' : ''}`);
  if (shops.length) bits.push(`${shops.length} boutique${shops.length > 1 ? 's' : ''}`);
  const genericPortrait = bits.length ? bits.slice(0, 3).join(' · ') : 'Son aventure commence sur Talk2Me.';
  const portrait = data.ai?.portrait || genericPortrait;

  return {
    user: { id: u.id, username: u.username, display_name: u.display_name, avatar_url: u.avatar_url, cover: u.cover, tagline: u.tagline, friends_count: u.friends_count },
    portrait,
    scenes,
    photos: data.photos.map((p) => ({ id: p.id, url: p.url, caption: p.caption })),
  };
}
