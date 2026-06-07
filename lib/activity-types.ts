/**
 * Phase 5 multi-user temps réel : activités synchronisées greffées sur appel.
 *
 * Doctrine : la conversation est le centre, les activités s'y greffent. La
 * première activité concrète est VideoCard sync (kind='video'). L'architecture
 * est volontairement extensible (musique, échecs, dames, whiteboard…).
 *
 * Pattern :
 *   - une Activity = { id, conv_id, kind, state, started_by, started_at }
 *   - `state` est type-spécifique (VideoSyncState pour 'video', etc.)
 *   - propagation temps réel via realtime-bus (events activity_start /
 *     activity_state / activity_end sur le canal conv:{convId})
 *
 * Cf [[talktome-multi-user-temps-reel]] section "Architecture activité
 * synchronisée".
 */

export type ActivityKind =
  | 'video'
  | 'music'
  | 'whiteboard'
  | 'chess'
  | 'dame';

/**
 * Talk2Me #408 — Statut d'invitation Watch Together (Pascal 2026-06-05).
 *
 * Doctrine [[talk2me-watch-together-passthrough]] : pas de partage forcé. Le
 * destinataire d'une activité doit explicitement accepter ou refuser.
 *
 *  - 'pending'  : créé par le leader, en attente du peer
 *  - 'accepted' : peer a tap [▶ Synchroniser] → activity active des deux côtés
 *  - 'declined' : peer a tap [Refuser] (auto-end ~5s plus tard pour cleanup)
 *  - 'ended'    : closed (équivalent ended_at IS NOT NULL pour l'invite UI)
 */
export type ActivityInviteStatus =
  | 'pending'
  | 'accepted'
  | 'declined'
  | 'ended';

export interface Activity<TState = unknown> {
  id: string;            // UUID
  conv_id: string;
  kind: ActivityKind;
  state: TState;         // type-specific
  started_by: string;    // user_id
  started_at: number;
  /** Talk2Me #408 — Consentement Watch Together (par défaut 'accepted'). */
  invite_status?: ActivityInviteStatus;
}

/**
 * State spécifique pour une activité kind='video' (VideoCard YouTube sync).
 * Le leader est le seul user dont les events player (play/pause/seek) sont
 * propagés en autorité. Tous les autres participants sont followers.
 */
export interface VideoSyncState {
  video_id: string;      // YouTube video id (11 chars)
  title: string;
  current_time_s: number;
  is_playing: boolean;
  updated_at: number;
  leader_id: string;     // user_id qui contrôle (leader-follower)
}

/** Type-guard helper. */
export function isVideoActivity(
  a: Activity<unknown>
): a is Activity<VideoSyncState> {
  if (a.kind !== 'video') return false;
  const s = a.state as Record<string, unknown> | null;
  if (!s || typeof s !== 'object') return false;
  return (
    typeof s.video_id === 'string' &&
    typeof s.title === 'string' &&
    typeof s.current_time_s === 'number' &&
    typeof s.is_playing === 'boolean' &&
    typeof s.leader_id === 'string'
  );
}
