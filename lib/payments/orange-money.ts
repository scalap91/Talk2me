'use server-only';

/**
 * Adaptateur Orange Money (Madagascar) — Pascal 2026-06-15.
 *
 * ⚠️ SCAFFOLD : structure prête, appels HTTP en TODO. Inerte tant que les clés
 * ne sont pas posées (orangeConfigured() → false → le rail refuse proprement).
 * Onboarding marchand Orange Money pas encore tenté côté Pascal.
 *
 * Modèle Orange Money WebPay (api.orange.com) : flux par REDIRECTION (on reçoit
 * une payment_url → on y envoie le payeur → il confirme → Orange notifie / on poll).
 * Différent de MVola (push USSD). Le routeur gère les deux.
 *
 * Variables d'env (PM2) à poser au branchement :
 *   ORANGE_CLIENT_ID=...            (Orange Developer — app)
 *   ORANGE_CLIENT_SECRET=...
 *   ORANGE_MERCHANT_KEY=...         (clé marchand WebPay)
 *   ORANGE_ENV=sandbox|prod         (défaut sandbox)
 *   ORANGE_COUNTRY=mdg              (code pays WebPay, à confirmer)
 *   ORANGE_RETURN_URL=https://talk2me.fr/wallet?topup=done
 *   ORANGE_CANCEL_URL=https://talk2me.fr/wallet?topup=cancel
 *   ORANGE_NOTIF_URL=https://talk2me.fr/api/payments/orange/callback
 *
 * ⚠️ À CONFIRMER au branchement (doc exacte du portail Orange) : base URL pays,
 * noms de champs WebPay, scope OAuth, et la DEVISE (Ariary). Voir [[project_talk2me_payment_rail]].
 */

import type { InitiateArgs, InitiateResult } from '@/lib/payments/operators';

function cfg() {
  const env = (process.env.ORANGE_ENV || 'sandbox').toLowerCase();
  return {
    clientId: process.env.ORANGE_CLIENT_ID || '',
    clientSecret: process.env.ORANGE_CLIENT_SECRET || '',
    merchantKey: process.env.ORANGE_MERCHANT_KEY || '',
    base: 'https://api.orange.com',
    country: process.env.ORANGE_COUNTRY || 'mdg',
    returnUrl: process.env.ORANGE_RETURN_URL || '',
    cancelUrl: process.env.ORANGE_CANCEL_URL || '',
    notifUrl: process.env.ORANGE_NOTIF_URL || '',
    env,
  };
}

export function orangeConfigured(): boolean {
  const c = cfg();
  return !!(c.clientId && c.clientSecret && c.merchantKey);
}

let cachedToken: { token: string; exp: number } | null = null;

async function getToken(): Promise<string> {
  const c = cfg();
  if (cachedToken && cachedToken.exp > Date.now() + 30_000) return cachedToken.token;
  const basic = Buffer.from(`${c.clientId}:${c.clientSecret}`).toString('base64');
  const res = await fetch(`${c.base}/oauth/v3/token`, {
    method: 'POST',
    headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) throw new Error(`orange_token_${res.status}`);
  const d = await res.json();
  cachedToken = { token: d.access_token, exp: Date.now() + (Number(d.expires_in || 3600) * 1000) };
  return cachedToken.token;
}

/**
 * Initie un WebPay : retourne une payment_url vers laquelle rediriger le payeur.
 * (cash-in / recharge). On stocke le pay_token en ref pour le polling de statut.
 */
export async function initiateOrangePayment(args: InitiateArgs): Promise<InitiateResult> {
  if (!orangeConfigured()) return { ok: false, error: 'orange_not_configured' };
  try {
    const c = cfg();
    const token = await getToken();
    // TODO(au branchement) : confirmer le chemin/pays et les champs exacts du portail.
    const res = await fetch(`${c.base}/orange-money-webpay/${c.country}/v1/webpayment`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        merchant_key: c.merchantKey,
        currency: 'MGA', // ⚠️ Ariary — à confirmer
        order_id: args.txRef,
        amount: Math.round(args.amount),
        return_url: c.returnUrl,
        cancel_url: c.cancelUrl,
        notif_url: c.notifUrl,
        lang: 'fr',
        reference: (args.description || 'Talk2Me').slice(0, 50),
      }),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: `orange_initiate_${res.status}`, status: d?.status };
    // d.payment_url (redirection) + d.pay_token (pour statut) + d.notif_token
    return { ok: true, checkoutUrl: d.payment_url, ref: d.pay_token, status: 'pending' };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'orange_error' };
  }
}

/** Statut d'un WebPay (poll de secours si pas de notif). */
export async function orangeStatus(payToken: string): Promise<{ status?: string; error?: string }> {
  if (!orangeConfigured()) return { error: 'orange_not_configured' };
  try {
    const c = cfg();
    const token = await getToken();
    const res = await fetch(`${c.base}/orange-money-webpay/${c.country}/v1/transactionstatus`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ order_id: '', amount: 0, pay_token: payToken }), // ⚠️ champs à confirmer
    });
    const d = await res.json().catch(() => ({}));
    return { status: d?.status }; // 'SUCCESS' | 'PENDING' | 'FAILED' (à normaliser au branchement)
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'orange_error' };
  }
}
