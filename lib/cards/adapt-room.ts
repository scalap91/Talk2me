/**
 * lib/cards/adapt-room — « perce le papier » : transforme un USER en room SuperCard
 * (le papier perforé). Aucune UI, QUE des infos/liens pour que la machine (SuperCardView)
 * streame le rendu : couverture = room_photo, action open → /piece?u=<owner> (stream la
 * scène WebGL), teaser = compteur music-wall RÉEL. Pur (browser-safe), doctrine Card OS.
 * Grounding : rien d'inventé — si pas de room_photo, images=[] (la machine met un fallback).
 */
import { CARD_FORMAT, CARD_SPEC, type SuperCard } from '@/lib/cards/supercard';

export interface RoomUser {
  id: string;
  username: string;
  display_name?: string | null;
  avatar_url?: string | null;
  room_photo?: string | null;
  room_tagline?: string | null;
  ai_name?: string | null;
  wall_count?: number | null; // nb de vidéos YouTube accrochées au mur (music-wall), réel
}

export function roomCardFromUser(u: RoomUser): SuperCard {
  const name = u.display_name || u.username;
  const teaser = typeof u.wall_count === 'number' && u.wall_count > 0
    ? `${u.wall_count} vidéo${u.wall_count > 1 ? 's' : ''} au mur · playlist`
    : (u.room_tagline || undefined);
  return {
    format: CARD_FORMAT,
    spec: CARD_SPEC,
    id: `room:${u.id}`,
    types: ['room'],
    title: `Salle de ${name}`,
    owner: u.id,
    images: u.room_photo ? [u.room_photo] : [],
    source: { name, label: name, icon: u.avatar_url || undefined },
    text: teaser ? { body: teaser } : undefined,
    actions: [{ kind: 'open', label: 'Entrer dans ma salle', url: `/piece?u=${u.id}` }],
    visibility: 'public',
  };
}
