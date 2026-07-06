/**
 * AliExpress Dropshipping — Redirect URI OAuth (enregistré côté AliExpress).
 * Le navigateur de Pascal arrive ici APRÈS autorisation, avec ?code=XXXX.
 * On échange le code contre access_token + refresh_token (signature IOP /rest),
 * on stocke le tout dans data/aliexpress-token.json, et on affiche une page de
 * confirmation. PUBLIC (pas de session T2M) — whitelisté dans middleware.ts.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { NextRequest } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const GATEWAY = 'https://api-sg.aliexpress.com/rest';
const TOKEN_FILE = path.join(process.cwd(), 'data', 'aliexpress-token.json');

function sign(apiPath: string, params: Record<string, string>, secret: string): string {
  const base = apiPath + Object.keys(params).sort().map((k) => k + params[k]).join('');
  return crypto.createHmac('sha256', secret).update(base, 'utf8').digest('hex').toUpperCase();
}

function page(title: string, body: string, ok: boolean): Response {
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>body{font-family:system-ui,-apple-system,sans-serif;background:#0e0e12;color:#fff;display:grid;place-items:center;min-height:100vh;margin:0;padding:24px}
.card{max-width:440px;background:#17171d;border:1px solid ${ok ? '#22c55e55' : '#ef444455'};border-radius:18px;padding:28px;text-align:center}
h1{font-size:20px;margin:0 0 8px}p{color:#b9b9c4;font-size:14px;line-height:1.5}.big{font-size:40px;margin-bottom:8px}</style></head>
<body><div class="card"><div class="big">${ok ? '✅' : '⚠️'}</div><h1>${title}</h1><p>${body}</p></div></body></html>`;
  return new Response(html, { status: ok ? 200 : 400, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  const appKey = process.env.ALIEXPRESS_DS_APP_KEY;
  const appSecret = process.env.ALIEXPRESS_DS_APP_SECRET;

  if (!code) return page('Code manquant', 'AliExpress n’a pas renvoyé de code d’autorisation. Relance le lien d’autorisation.', false);
  if (!appKey || !appSecret) return page('Configuration manquante', 'Les clés AliExpress ne sont pas configurées sur le serveur.', false);

  const apiPath = '/auth/token/create';
  const params: Record<string, string> = { app_key: appKey, sign_method: 'sha256', timestamp: String(Date.now()), code };
  params.sign = sign(apiPath, params, appSecret);

  try {
    const r = await fetch(GATEWAY + apiPath + '?' + new URLSearchParams(params).toString(), { method: 'POST' });
    const data = await r.json().catch(() => ({}));
    const token = data.access_token || data.accessToken;
    if (!token) {
      const msg = data.error_msg || data.message || data.code || JSON.stringify(data).slice(0, 300);
      return page('Échange échoué', `AliExpress a refusé l’échange : <code>${msg}</code>. (Code expiré ? Relance l’autorisation.)`, false);
    }
    const record = {
      access_token: token,
      refresh_token: data.refresh_token || data.refreshToken || null,
      expires_in: data.expires_in || data.expire_time || null,
      refresh_expires_in: data.refresh_token_valid_time || data.refresh_expires_in || null,
      account: data.account || data.user_nick || null,
      obtained_at: Date.now(),
      raw: data,
    };
    try { fs.mkdirSync(path.dirname(TOKEN_FILE), { recursive: true }); fs.writeFileSync(TOKEN_FILE, JSON.stringify(record, null, 2)); } catch { /* */ }
    return page('Talk2Me connecté à AliExpress', 'Le jeton d’accès a été obtenu et enregistré. Tu peux fermer cette page — le reste se passe côté serveur.', true);
  } catch (e) {
    return page('Erreur réseau', `Impossible de joindre AliExpress : ${(e as Error).message}`, false);
  }
}
