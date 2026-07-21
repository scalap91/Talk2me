/**
 * lib/cards/v2/reader/feed — dénormalisation FEED via LE LECTEUR UNIQUE (contexte `feed`).
 *
 * Bascule #2 (niveau 1) : les hints d'item de feed (kind / média de couverture / légende) sont
 * produits par `renderCard(card,'feed')` au lieu de la logique ad-hoc de `cardToFeedItem`.
 * Additif, pur, comparable au legacy AVANT tout branchement. Ne touche NI le `.card` source
 * (`dotcard`), NI les compteurs/auteur : uniquement les champs d'affichage dérivés.
 */
import type { SuperCardV2 } from '../types';
import { renderCard } from './reader';

export interface FeedDisplayV2 {
  type: 'video' | 'image' | 'texte';
  kind: 'video_card' | 'image_card' | 'texte_card';
  media_url: string | null;
  caption: string | null;
}

function clean(s?: string): string {
  return (s || '').replace(/\s+/g, ' ').trim();
}

/** Dérive les hints d'affichage du feed depuis le ViewModel du lecteur unique (contexte `feed`). */
export function feedDisplayV2(card: SuperCardV2): FeedDisplayV2 {
  const view = renderCard(card, 'feed'); // le lecteur unique choisit le média de couverture + le corps
  const cover = view.media[0];
  // Le TYPE reflète ce que la carte EST (son `kind`), pas seulement sa couverture : une carte
  // vidéo a souvent une VIGNETTE image en couverture (comme le legacy qui teste types.includes('video')).
  const isVideo = view.kind === 'video' || view.kind === 'film' || cover?.type === 'video';
  const hasImage = view.media.some((m) => m.type === 'image');
  const type: FeedDisplayV2['type'] = isVideo ? 'video' : hasImage ? 'image' : 'texte';
  const kind = type === 'video' ? 'video_card' : type === 'image' ? 'image_card' : 'texte_card';
  // Légende = le vrai contenu (corps puis titre) — grounded, jamais inventé.
  const caption = clean(card.text?.body) || clean(card.title) || null;
  return { type, kind, media_url: cover?.url ?? null, caption };
}
