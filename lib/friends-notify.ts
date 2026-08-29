import 'server-only';
/**
 * Talk2Me — NOTIFICATIONS AUX AMIS (module unique, Pascal 2026-08-29). Regroupe TOUS les fan-out
 * vers les amis d'un user (avant éparpillés : go-live dans lib/live/notify.ts, nouveau post dans
 * lib/friend-post-notify.ts) → un seul endroit.
 *
 * Deux canaux réutilisant l'infra existante :
 *   - web-push / FCM → lib/push.sendPushToUser (persiste aussi une trace in-app, cf. store).
 *   - in-app realtime → bus canal `user:{friendId}` (toasts live), pour les amis en ligne.
 * On n'avertit QUE les amis (jamais tout le monde). PII air-gap : on n'expose que username/display_name.
 */
import { listFriendIds, getUserById } from '@/lib/db';
import { sendPushToUser } from '@/lib/push';
import { publish } from '@/lib/realtime-bus';
import type { LiveAuthor } from '@/lib/live/session';

/* ─────────────────────────── LIVE ─────────────────────────── */

/** URL d'ouverture du live d'un diffuseur = le viewer plein écran (hors 3D). */
export function liveUrl(hostUserId: string): string {
  return `/live/${encodeURIComponent(hostUserId)}`;
}

function liveLabel(a: LiveAuthor): string {
  return (a.display_name && a.display_name.trim()) || a.username;
}

/** Avertit les amis d'un diffuseur qui vient de passer EN DIRECT. Best-effort. Retourne le nb d'amis. */
export async function notifyFriendsGoLive(hostUserId: string, broadcaster: LiveAuthor): Promise<number> {
  const friendIds = listFriendIds(hostUserId);
  if (!friendIds.length) return 0;
  const url = liveUrl(hostUserId);
  const name = liveLabel(broadcaster);
  const tag = `live-${hostUserId}`; // une notif par diffuseur
  await Promise.all(friendIds.map(async (fid) => {
    try { publish(`user:${fid}`, { kind: 'live_start', data: { liveId: hostUserId, broadcaster: { username: broadcaster.username, display_name: broadcaster.display_name }, url } }); } catch { /* */ }
    try { await sendPushToUser(fid, { title: `🔴 ${name} est en direct`, body: 'Rejoins le live maintenant', url, tag, type: 'live', store: false }); } catch { /* */ }
  }));
  return friendIds.length;
}

/** Prévient les amis que le live est terminé (in-app only, best-effort). */
export function notifyFriendsLiveEnded(hostUserId: string): void {
  for (const fid of listFriendIds(hostUserId)) {
    try { publish(`user:${fid}`, { kind: 'live_end', data: { liveId: hostUserId } }); } catch { /* */ }
  }
}

/* ─────────────────────── NOUVEAU POST ─────────────────────── */

/** À la 1re publication d'un post, les AMIS reçoivent un push + trace in-app (lien /card/id). */
export function notifyFriendsOfNewPost(authorId: string, postId: string, caption?: string | null): void {
  if (!authorId || !postId) return;
  try {
    const author = getUserById(authorId) as { display_name?: string | null; username?: string | null; avatar_url?: string | null } | null;
    const name = (author?.display_name || author?.username || 'Un ami').toString().trim();
    const snippet = (caption || '').replace(/\s+/g, ' ').trim().slice(0, 90);
    const link = `/card/${postId}`;
    const friends = listFriendIds(authorId);
    // fire-and-forget : la réponse de publication part tout de suite.
    void Promise.allSettled(friends.map((fid) =>
      sendPushToUser(fid, {
        title: `${name} a publié`,
        body: snippet || 'Nouveau post à voir',
        url: link,
        tag: `post-${postId}`,
        type: 'friend_post',
        actorId: authorId,
        actorAvatar: author?.avatar_url ?? null,
      }),
    ));
  } catch { /* best-effort : une notif ne casse jamais une publication */ }
}
