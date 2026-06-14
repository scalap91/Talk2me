'use server-only';

/**
 * Talk2Me — OAuth réseaux (Meta + Google/YouTube) pour le POST DIRECT.
 * Config 100% via env (inerte tant que les clés ne sont pas posées — pattern
 * Mapillary/Swan). Aucune valeur en dur. Redirect URIs à déclarer côté apps :
 *   Meta   : https://www.talk2me.fr/api/connect/meta/callback
 *   Google : https://www.talk2me.fr/api/connect/google/callback
 */

const BASE = 'https://www.talk2me.fr';
const GRAPH = 'https://graph.facebook.com/v21.0';

export const meta = {
  appId: process.env.META_APP_ID || '',
  appSecret: process.env.META_APP_SECRET || '',
  redirect: `${BASE}/api/connect/meta/callback`,
  scope: ['pages_manage_posts', 'pages_read_engagement', 'instagram_basic', 'instagram_content_publish', 'business_management'].join(','),
  get configured() { return !!(this.appId && this.appSecret); },
  authUrl(state: string) {
    return `https://www.facebook.com/v21.0/dialog/oauth?client_id=${this.appId}&redirect_uri=${encodeURIComponent(this.redirect)}&scope=${encodeURIComponent(this.scope)}&state=${state}&response_type=code`;
  },
};

export const google = {
  clientId: process.env.GOOGLE_CLIENT_ID || '',
  clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
  redirect: `${BASE}/api/connect/google/callback`,
  scope: 'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly',
  get configured() { return !!(this.clientId && this.clientSecret); },
  authUrl(state: string) {
    return `https://accounts.google.com/o/oauth2/v2/auth?client_id=${this.clientId}&redirect_uri=${encodeURIComponent(this.redirect)}&response_type=code&scope=${encodeURIComponent(this.scope)}&access_type=offline&prompt=consent&state=${state}`;
  },
};

/** Meta : code → token user long-lived → pages (+ IG lié) avec page tokens. */
export async function metaExchange(code: string): Promise<{ pages: { id: string; name: string; token: string; ig?: { id: string; username: string } }[] }> {
  const short = await fetch(`${GRAPH}/oauth/access_token?client_id=${meta.appId}&redirect_uri=${encodeURIComponent(meta.redirect)}&client_secret=${meta.appSecret}&code=${encodeURIComponent(code)}`).then((r) => r.json());
  if (!short.access_token) throw new Error('meta_token_failed');
  const long = await fetch(`${GRAPH}/oauth/access_token?grant_type=fb_exchange_token&client_id=${meta.appId}&client_secret=${meta.appSecret}&fb_exchange_token=${short.access_token}`).then((r) => r.json());
  const userToken = long.access_token || short.access_token;
  const acc = await fetch(`${GRAPH}/me/accounts?fields=id,name,access_token&access_token=${userToken}`).then((r) => r.json());
  const pages: { id: string; name: string; token: string; ig?: { id: string; username: string } }[] = [];
  for (const p of (acc.data || [])) {
    const page = { id: p.id as string, name: p.name as string, token: p.access_token as string };
    try {
      const igq = await fetch(`${GRAPH}/${p.id}?fields=instagram_business_account{id,username}&access_token=${p.access_token}`).then((r) => r.json());
      if (igq.instagram_business_account) (page as { ig?: { id: string; username: string } }).ig = { id: igq.instagram_business_account.id, username: igq.instagram_business_account.username };
    } catch { /* pas d'IG lié */ }
    pages.push(page);
  }
  return { pages };
}

/** Google : code → tokens → infos chaîne YouTube. */
export async function googleExchange(code: string): Promise<{ accessToken: string; refreshToken: string | null; expiresAt: number; channel: { id: string; title: string } | null }> {
  const tok = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, client_id: google.clientId, client_secret: google.clientSecret, redirect_uri: google.redirect, grant_type: 'authorization_code' }),
  }).then((r) => r.json());
  if (!tok.access_token) throw new Error('google_token_failed');
  let channel: { id: string; title: string } | null = null;
  try {
    const ch = await fetch('https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true', { headers: { Authorization: `Bearer ${tok.access_token}` } }).then((r) => r.json());
    if (ch.items?.[0]) channel = { id: ch.items[0].id, title: ch.items[0].snippet?.title || 'Ma chaîne' };
  } catch { /* */ }
  return { accessToken: tok.access_token, refreshToken: tok.refresh_token || null, expiresAt: Date.now() + (tok.expires_in || 3600) * 1000, channel };
}

/** Google : rafraîchit l'access token avec le refresh token. */
export async function googleRefresh(refreshToken: string): Promise<{ accessToken: string; expiresAt: number } | null> {
  const tok = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ refresh_token: refreshToken, client_id: google.clientId, client_secret: google.clientSecret, grant_type: 'refresh_token' }),
  }).then((r) => r.json());
  if (!tok.access_token) return null;
  return { accessToken: tok.access_token, expiresAt: Date.now() + (tok.expires_in || 3600) * 1000 };
}
