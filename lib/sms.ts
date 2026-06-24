/**
 * Talk2Me — envoi SMS (Pascal 2026-06-24). Provider principal : MAPI (mapi.mg), la
 * plateforme SMS professionnelle locale de Madagascar (partenaire PaPi). Bonne couverture
 * 03X multi-opérateur, paiement mobile money. Fallback Twilio si configuré. Sans clés →
 * {sent:false} → l'appelant affiche le code en fallback DEV. Portable : 1 fichier à toucher.
 *
 * ENV MAPI : MAPI_USERNAME, MAPI_PASSWORD (compte messaging.mapi.mg).
 * ENV Twilio (fallback) : TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_SMS_FROM.
 */
export interface SmsResult { sent: boolean; provider?: string; error?: string }

/* ===================== ORANGE SMS API (Madagascar) — provider principal =====================
 * ENV :
 *   ORANGE_AUTH_HEADER   = le "Authorization header" Basic fourni par le portail Orange
 *                          (onglet Credentials), OU :
 *   ORANGE_CLIENT_ID + ORANGE_CLIENT_SECRET
 *   ORANGE_SENDER_ADDRESS= adresse expéditeur, format "tel:+261XXXXXXXXX" (validée Orange)
 *   ORANGE_SENDER_NAME   = (optionnel) nom expéditeur alphanumérique
 */
const ORANGE_TOKEN_URL = 'https://api.orange.com/oauth/v3/token';
const ORANGE_SMS_BASE = 'https://api.orange.com/smsmessaging/v1/outbound';
let orangeToken: { token: string; exp: number } | null = null;

function orangeBasic(): string | null {
  const h = process.env.ORANGE_AUTH_HEADER;
  if (h) return h.trim().startsWith('Basic ') ? h.trim() : 'Basic ' + h.trim();
  const id = process.env.ORANGE_CLIENT_ID, sec = process.env.ORANGE_CLIENT_SECRET;
  if (id && sec) return 'Basic ' + Buffer.from(`${id}:${sec}`).toString('base64');
  return null;
}

export function orangeConfigured(): boolean {
  return !!orangeBasic() && !!process.env.ORANGE_SENDER_ADDRESS;
}

async function orangeAccessToken(): Promise<string | null> {
  const auth = orangeBasic();
  if (!auth) return null;
  if (orangeToken && orangeToken.exp > Date.now() + 30_000) return orangeToken.token;
  try {
    const res = await fetch(ORANGE_TOKEN_URL, {
      method: 'POST',
      headers: { Authorization: auth, 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: 'grant_type=client_credentials',
    });
    const j = (await res.json().catch(() => null)) as { access_token?: string; expires_in?: number } | null;
    if (j?.access_token) {
      orangeToken = { token: j.access_token, exp: Date.now() + (j.expires_in ?? 3600) * 1000 };
      return j.access_token;
    }
  } catch { /* */ }
  return null;
}

async function sendViaOrange(toE164: string, body: string): Promise<SmsResult | null> {
  if (!orangeConfigured()) return null;
  const token = await orangeAccessToken();
  if (!token) return { sent: false, provider: 'orange', error: 'orange_auth_failed' };
  const sender = process.env.ORANGE_SENDER_ADDRESS as string; // "tel:+261..."
  try {
    const payload: {
      outboundSMSMessageRequest: {
        address: string; senderAddress: string;
        outboundSMSTextMessage: { message: string }; senderName?: string;
      };
    } = {
      outboundSMSMessageRequest: {
        address: `tel:${toE164}`,
        senderAddress: sender,
        outboundSMSTextMessage: { message: body },
      },
    };
    if (process.env.ORANGE_SENDER_NAME) payload.outboundSMSMessageRequest.senderName = process.env.ORANGE_SENDER_NAME;
    const res = await fetch(`${ORANGE_SMS_BASE}/${encodeURIComponent(sender)}/requests`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
    });
    if (res.ok || res.status === 201) return { sent: true, provider: 'orange' };
    const t = await res.text().catch(() => '');
    return { sent: false, provider: 'orange', error: t.slice(0, 200) };
  } catch (e) {
    return { sent: false, provider: 'orange', error: e instanceof Error ? e.message : 'orange_error' };
  }
}

const MAPI_BASE = 'https://messaging.mapi.mg';
// Token JWT MAPI (durée 15 min) — caché en mémoire process, renouvelé avant expiration.
let mapiToken: { token: string; exp: number } | null = null;

async function getMapiToken(): Promise<string | null> {
  const username = process.env.MAPI_USERNAME;
  const password = process.env.MAPI_PASSWORD;
  if (!username || !password) return null;
  if (mapiToken && mapiToken.exp > Date.now() + 30_000) return mapiToken.token;
  try {
    const fd = new FormData();
    fd.set('Username', username);
    fd.set('Password', password);
    const res = await fetch(`${MAPI_BASE}/api/authentication/login`, { method: 'POST', body: fd });
    const j = (await res.json().catch(() => null)) as { status?: boolean; token?: string } | null;
    if (j?.status && j.token) {
      mapiToken = { token: j.token, exp: Date.now() + 14 * 60 * 1000 }; // marge sous les 15 min
      return j.token;
    }
  } catch { /* */ }
  return null;
}

/** MAPI attend le format LOCAL malgache (0XXXXXXXXX), pas le E.164. */
function toLocalMada(e164: string): string {
  if (e164.startsWith('+261')) return '0' + e164.slice(4);
  return e164.replace(/^\+/, '');
}

async function sendViaMapi(toE164: string, body: string): Promise<SmsResult | null> {
  if (!process.env.MAPI_USERNAME || !process.env.MAPI_PASSWORD) return null;
  const token = await getMapiToken();
  if (!token) return { sent: false, provider: 'mapi', error: 'mapi_auth_failed' };
  try {
    const fd = new FormData();
    fd.set('Recipient', toLocalMada(toE164));
    fd.set('Message', body);
    fd.set('Channel', 'sms');
    const res = await fetch(`${MAPI_BASE}/api/msg/send`, { method: 'POST', headers: { Authorization: token }, body: fd });
    const j = (await res.json().catch(() => null)) as { status?: boolean } | null;
    if (res.ok && j?.status) return { sent: true, provider: 'mapi' };
    return { sent: false, provider: 'mapi', error: JSON.stringify(j || {}).slice(0, 200) };
  } catch (e) {
    return { sent: false, provider: 'mapi', error: e instanceof Error ? e.message : 'mapi_error' };
  }
}

async function sendViaTwilio(toE164: string, body: string): Promise<SmsResult | null> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_SMS_FROM;
  if (!sid || !token || !from) return null;
  try {
    const params = new URLSearchParams();
    params.set('To', toE164);
    if (from.startsWith('MG')) params.set('MessagingServiceSid', from);
    else params.set('From', from);
    params.set('Body', body);
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });
    if (res.ok) return { sent: true, provider: 'twilio' };
    const txt = await res.text().catch(() => '');
    return { sent: false, provider: 'twilio', error: txt.slice(0, 200) };
  } catch (e) {
    return { sent: false, provider: 'twilio', error: e instanceof Error ? e.message : 'sms_error' };
  }
}

export async function sendSms(toE164: string, body: string): Promise<SmsResult> {
  const o = await sendViaOrange(toE164, body);
  if (o) return o;
  const m = await sendViaMapi(toE164, body);
  if (m) return m;
  const tw = await sendViaTwilio(toE164, body);
  if (tw) return tw;
  return { sent: false, error: 'no_sms_provider' };
}
