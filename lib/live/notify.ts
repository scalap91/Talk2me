import 'server-only';

/**
 * Talk2Me — Notifications "go-live" (Pascal 2026-07-04).
 *
 * Quand un diffuseur passe EN DIRECT, on avertit UNIQUEMENT ses amis/contacts
 * (jamais tout le monde), UNE seule fois par passage en direct (le verrou
 * `isNew` est géré en amont par startLiveSession).
 *
 * Deux canaux, réutilisant l'infra existante :
 *   - web-push / FCM  → lib/push.sendPushToUser (comme les appels, les colis…)
 *   - in-app          → bus realtime canal `user:{friendId}` (comme call:incoming),
 *                       consommé par /api/me/events → <GoLiveWatcher> affiche un toast.
 *
 * Doctrine [[talk2me-pii-air-gap]] : on n'expose que { username, display_name }.
 */

import { listFriendIds } from '@/lib/db';
import { sendPushToUser } from '@/lib/push';
import { publish } from '@/lib/realtime-bus';
import type { LiveAuthor } from './session';

/** URL d'ouverture du live d'un diffuseur = le viewer plein écran (hors 3D). */
export function liveUrl(hostUserId: string): string {
  return `/live/${encodeURIComponent(hostUserId)}`;
}

function label(a: LiveAuthor): string {
  return (a.display_name && a.display_name.trim()) || a.username;
}

/**
 * Avertit les amis d'un diffuseur qui vient de passer EN DIRECT.
 * Best-effort, non bloquant (ne jette jamais). Retourne le nb d'amis notifiés.
 */
export async function notifyFriendsGoLive(
  hostUserId: string,
  broadcaster: LiveAuthor
): Promise<number> {
  const friendIds = listFriendIds(hostUserId);
  if (!friendIds.length) return 0;
  const url = liveUrl(hostUserId);
  const name = label(broadcaster);
  const tag = `live-${hostUserId}`; // regroupe : une notif par diffuseur

  await Promise.all(
    friendIds.map(async (fid) => {
      // 1) in-app (bus) — instantané pour les amis en ligne
      try {
        publish(`user:${fid}`, {
          kind: 'live_start',
          data: {
            liveId: hostUserId,
            broadcaster: { username: broadcaster.username, display_name: broadcaster.display_name },
            url,
          },
        });
      } catch {
        /* ignore */
      }
      // 2) web-push / FCM — pour les amis hors app
      try {
        await sendPushToUser(fid, {
          title: `🔴 ${name} est en direct`,
          body: 'Rejoins le live maintenant',
          url,
          tag,
        });
      } catch {
        /* ignore */
      }
    })
  );
  return friendIds.length;
}

/** Prévient les amis que le live est terminé (in-app only, best-effort). */
export function notifyFriendsLiveEnded(hostUserId: string): void {
  const friendIds = listFriendIds(hostUserId);
  for (const fid of friendIds) {
    try {
      publish(`user:${fid}`, { kind: 'live_end', data: { liveId: hostUserId } });
    } catch {
      /* ignore */
    }
  }
}
