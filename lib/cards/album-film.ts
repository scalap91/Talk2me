import 'server-only';
/**
 * ALBUM (musique multi-pistes MP3) & FILM (bande-annonce + film complet) natifs vendables.
 * Pascal 2026-07-17 — extension natif-first du `.card` : le web n'avait que le son YouTube
 * unique et la vidéo unique. Ici on construit de VRAIS `.card` (writeCardFile) portant les
 * facettes étendues (audio.tracks[], audio.url MP3 ; video.trailer/full ; price) que le
 * lecteur unique (web AlignedPostCard + natif) sait désormais lire. AUCUN renderer bricolé.
 *
 * PAS de `channel:'boutique'` : ce sont des POSTS du feed (un post sans channel n'est jamais
 * masqué par les sections). Le prix + actions[buy] les rend vendables sans les sortir du feed.
 */
import type { SuperCard } from '@/lib/cards/supercard';

export interface AlbumTrackInput { title: string; artist?: string; url: string; duration?: string }
export interface AlbumCardInput {
  title: string;
  artist?: string;
  cover?: string;               // pochette (/uploads), = images[0]
  tracks: AlbumTrackInput[];    // pistes MP3 uploadées
  price?: { amount?: number; currency?: string };
  music?: NonNullable<SuperCard['music']>; // métadonnées DDEX (œuvre/enregistrement/sortie/droits/ids)
}
export interface FilmCardInput {
  title: string;
  cover?: string;               // affiche (/uploads)
  trailer?: string;             // bande-annonce (aperçu gratuit)
  full?: string;                // film complet (débloqué à l'achat)
  synopsis?: string;
  price?: { amount?: number; currency?: string };
}

function priced(p?: { amount?: number; currency?: string }): boolean {
  return !!p && typeof p.amount === 'number' && p.amount > 0;
}

/** Construit le `.card` ALBUM (musique). Pochette = images[0], pistes = audio.tracks[]. */
export function buildAlbumCard(id: string, input: AlbumCardInput, ownerId: string): SuperCard {
  const tracks = (input.tracks || []).filter((t) => t && typeof t.url === 'string' && t.url.trim().length > 0);
  const isPriced = priced(input.price);
  const card: SuperCard = {
    format: 't2m.card', spec: 1, id, version: 1, state: 'published',
    title: (input.title || tracks[0]?.title || 'Album').slice(0, 120),
    owner: ownerId,
    types: isPriced ? ['audio', 'album', 'product'] : ['audio', 'album'],
    images: input.cover ? [input.cover] : [],
    audio: {
      title: tracks[0]?.title || input.title || '',
      author: input.artist || undefined,
      thumbnail: input.cover || undefined,
      url: tracks[0]?.url,          // 1re piste = principale (compat lecteurs simples)
      tracks,                        // album complet
    },
  };
  if (isPriced) {
    card.price = { amount: input.price!.amount, currency: input.price!.currency || 'Ar' };
    card.actions = [{ kind: 'buy', label: 'Acheter' }];
  }
  if (input.music && Object.keys(input.music).length) card.music = input.music; // métadonnées DDEX
  return card;
}

/** Construit le `.card` FILM. video.url = bande-annonce (aperçu jouable au feed) ; video.full = film payant. */
export function buildFilmCard(id: string, input: FilmCardInput, ownerId: string): SuperCard {
  const main = input.trailer || input.full;   // l'aperçu jouable = la bande-annonce si présente
  const isPriced = priced(input.price);
  const card: SuperCard = {
    format: 't2m.card', spec: 1, id, version: 1, state: 'published',
    title: (input.title || 'Film').slice(0, 120),
    owner: ownerId,
    types: isPriced ? ['video', 'film', 'product'] : ['video', 'film'],
    images: input.cover ? [input.cover] : [],
    video: {
      url: main || undefined,
      aspect: '16 / 9',
      trailer: input.trailer || undefined,
      full: input.full || undefined,
    },
  };
  if (input.synopsis && input.synopsis.trim()) card.text = { body: input.synopsis.trim() };
  if (isPriced) {
    card.price = { amount: input.price!.amount, currency: input.price!.currency || 'Ar' };
    card.actions = [{ kind: 'buy', label: 'Acheter' }];
  }
  return card;
}
