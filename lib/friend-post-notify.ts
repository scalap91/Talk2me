/**
 * Talk2Me — NOTIF « un ami a publié » (Pascal 2026-08-29). À la 1re publication d'un post par un
 * user, ses AMIS reçoivent un push (+ trace in-app auto via sendPushToUser store). Fan-out
 * fire-and-forget : ne bloque JAMAIS la réponse de publication. Feed/story = friends-only, cohérent.
 */
import { listFriendIds } from '@/lib/db-friendships';
import { getUserById } from '@/lib/db';
import { sendPushToUser } from '@/lib/push';

export function notifyFriendsOfNewPost(authorId: string, postId: string, caption?: string | null): void {
  if (!authorId || !postId) return;
  try {
    const author = getUserById(authorId) as { display_name?: string | null; username?: string | null; avatar_url?: string | null } | null;
    const name = (author?.display_name || author?.username || 'Un ami').toString().trim();
    const snippet = (caption || '').replace(/\s+/g, ' ').trim().slice(0, 90);
    const link = `/card/${postId}`;
    const friends = listFriendIds(authorId);
    // fire-and-forget : on n'attend pas les N envois (la réponse de publication part tout de suite).
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
