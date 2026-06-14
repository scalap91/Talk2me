'use server-only';

/**
 * Talk2Me — PUBLICATION DIRECTE sur les réseaux connectés (Pascal 2026-06-10).
 * FB Page, Instagram (Business), YouTube. Gated : si le compte n'est pas
 * connecté → { ok:false, error:'not_connected' }. Tokens jamais exposés au
 * client/IA (lus côté serveur uniquement via connected-accounts).
 *
 * URLs média : FB/IG récupèrent l'image/vidéo par URL PUBLIQUE (https) ;
 * YouTube uploade le fichier local.
 */

import { readFile } from 'fs/promises';
import { getAccount, upsertAccount } from '@/lib/connected-accounts';
import { googleRefresh } from '@/lib/social/oauth';

const GRAPH = 'https://graph.facebook.com/v21.0';
const PUBLIC = 'https://www.talk2me.fr';

function publicUrl(mediaUrl: string): string {
  return mediaUrl.startsWith('http') ? mediaUrl : `${PUBLIC}${mediaUrl}`;
}
function localPath(mediaUrl: string): string {
  return `/home/ubuntu/talktome/public${mediaUrl.replace(/^https?:\/\/[^/]+/, '')}`;
}

export async function publishFacebookPage(userId: string, p: { message?: string; imageUrl?: string; videoUrl?: string }): Promise<{ ok: boolean; id?: string; error?: string }> {
  const acc = getAccount(userId, 'facebook_page');
  if (!acc || !acc.external_id) return { ok: false, error: 'not_connected' };
  const token = acc.access_token;
  try {
    let res: Response;
    if (p.videoUrl) {
      res = await fetch(`${GRAPH}/${acc.external_id}/videos`, { method: 'POST', body: new URLSearchParams({ file_url: publicUrl(p.videoUrl), description: p.message || '', access_token: token }) });
    } else if (p.imageUrl) {
      res = await fetch(`${GRAPH}/${acc.external_id}/photos`, { method: 'POST', body: new URLSearchParams({ url: publicUrl(p.imageUrl), caption: p.message || '', access_token: token }) });
    } else {
      res = await fetch(`${GRAPH}/${acc.external_id}/feed`, { method: 'POST', body: new URLSearchParams({ message: p.message || '', access_token: token }) });
    }
    const d = await res.json();
    if (d.id || d.post_id) return { ok: true, id: d.id || d.post_id };
    return { ok: false, error: d.error?.message || 'fb_failed' };
  } catch (e) { return { ok: false, error: (e as Error).message }; }
}

export async function publishInstagram(userId: string, p: { imageUrl?: string; videoUrl?: string; caption?: string }): Promise<{ ok: boolean; id?: string; error?: string }> {
  const acc = getAccount(userId, 'instagram');
  const igId = (acc?.meta?.ig_user_id as string) || acc?.external_id;
  if (!acc || !igId) return { ok: false, error: 'not_connected' };
  const token = acc.access_token;
  try {
    const body = new URLSearchParams({ caption: p.caption || '', access_token: token });
    if (p.videoUrl) { body.set('media_type', 'REELS'); body.set('video_url', publicUrl(p.videoUrl)); }
    else if (p.imageUrl) { body.set('image_url', publicUrl(p.imageUrl)); }
    else return { ok: false, error: 'no_media' };
    const create = await fetch(`${GRAPH}/${igId}/media`, { method: 'POST', body }).then((r) => r.json());
    if (!create.id) return { ok: false, error: create.error?.message || 'ig_container_failed' };
    // Vidéo : attendre que le container soit FINISHED (max ~60s).
    if (p.videoUrl) {
      for (let i = 0; i < 20; i++) {
        await new Promise((r) => setTimeout(r, 3000));
        const st = await fetch(`${GRAPH}/${create.id}?fields=status_code&access_token=${token}`).then((r) => r.json());
        if (st.status_code === 'FINISHED') break;
        if (st.status_code === 'ERROR') return { ok: false, error: 'ig_processing_error' };
      }
    }
    const pub = await fetch(`${GRAPH}/${igId}/media_publish`, { method: 'POST', body: new URLSearchParams({ creation_id: create.id, access_token: token }) }).then((r) => r.json());
    if (pub.id) return { ok: true, id: pub.id };
    return { ok: false, error: pub.error?.message || 'ig_publish_failed' };
  } catch (e) { return { ok: false, error: (e as Error).message }; }
}

export async function uploadYouTube(userId: string, p: { videoUrl: string; title: string; description?: string }): Promise<{ ok: boolean; id?: string; error?: string }> {
  const acc = getAccount(userId, 'youtube');
  if (!acc) return { ok: false, error: 'not_connected' };
  let token = acc.access_token;
  // Rafraîchir si expiré.
  if (acc.expires_at && acc.expires_at < Date.now() + 60000 && acc.refresh_token) {
    const r = await googleRefresh(acc.refresh_token);
    if (r) { token = r.accessToken; upsertAccount(userId, 'youtube', { externalId: acc.external_id, name: acc.name, accessToken: r.accessToken, refreshToken: acc.refresh_token, expiresAt: r.expiresAt }); }
  }
  try {
    const bytes = await readFile(localPath(p.videoUrl));
    const meta = { snippet: { title: p.title.slice(0, 100), description: (p.description || '').slice(0, 4500) }, status: { privacyStatus: 'private', selfDeclaredMadeForKids: false } };
    const boundary = 'ttm' + Math.random().toString(36).slice(2);
    const head = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${boundary}\r\nContent-Type: video/mp4\r\n\r\n`;
    const tail = `\r\n--${boundary}--`;
    const multipart = Buffer.concat([Buffer.from(head, 'utf8'), bytes, Buffer.from(tail, 'utf8')]);
    const res = await fetch('https://www.googleapis.com/upload/youtube/v3/videos?part=snippet,status&uploadType=multipart', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': `multipart/related; boundary=${boundary}` },
      body: multipart,
    }).then((r) => r.json());
    if (res.id) return { ok: true, id: res.id };
    return { ok: false, error: res.error?.message || 'yt_failed' };
  } catch (e) { return { ok: false, error: (e as Error).message }; }
}
