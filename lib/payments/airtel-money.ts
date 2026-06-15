'use server-only';

/**
 * Adaptateur Airtel Money (Madagascar) — Pascal 2026-06-15.
 *
 * ⚠️ SCAFFOLD : structure prête, appels HTTP en TODO. Inerte tant que les clés
 * ne sont pas posées (airtelConfigured() → false → le rail refuse proprement).
 * Onboarding marchand Airtel Money pas encore tenté côté Pascal.
 *
 * Modèle Airtel Africa Open API : flux par PUSH USSD (Collection « Request to
 * Pay ») — comme MVola, pas de redirection. On envoie une demande, le payeur
 * confirme sur son tél, Airtel notifie / on poll le statut.
 *
 * Variables d'env (PM2) à poser au branchement :
 *   AIRTEL_CLIENT_ID=...           (Airtel Developer — app)
 *   AIRTEL_CLIENT_SECRET=...
 *   AIRTEL_ENV=sandbox|prod         (défaut sandbox)
 *   AIRTEL_COUNTRY=MG               (ISO pays)
 *   AIRTEL_CURRENCY=MGA             (Ariary)
 *
 * ⚠️ À CONFIRMER au branchement (doc Airtel) : base URL, chiffrement éventuel du
 * PIN/clé publique, noms de champs, normalisation des statuts. Voir [[project_talk2me_payment_rail]].
 */

import { randomUUID } from 'crypto';
import type { InitiateArgs, InitiateResult } from '@/lib/payments/operators';

function cfg() {
  const env = (process.env.AIRTEL_ENV || 'sandbox').toLowerCase();
  return {
    clientId: process.env.AIRTEL_CLIENT_ID || '',
    clientSecret: process.env.AIRTEL_CLIENT_SECRET || '',
    base: env === 'prod' ? 'https://openapi.airtel.africa' : 'https://openapiuat.airtel.africa',
    country: process.env.AIRTEL_COUNTRY || 'MG',
    currency: process.env.AIRTEL_CURRENCY || 'MGA',
    env,
  };
}

export function airtelConfigured(): boolean {
  const c = cfg();
  return !!(c.clientId && c.clientSecret);
}

let cachedToken: { token: string; exp: number } | null = null;

async function getToken(): Promise<string> {
  const c = cfg();
  if (cachedToken && cachedToken.exp > Date.now() + 30_000) return cachedToken.token;
  const res = await fetch(`${c.base}/auth/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: '*/*' },
    body: JSON.stringify({ client_id: c.clientId, client_secret: c.clientSecret, grant_type: 'client_credentials' }),
  });
  if (!res.ok) throw new Error(`airtel_token_${res.status}`);
  const d = await res.json();
  cachedToken = { token: d.access_token, exp: Date.now() + (Number(d.expires_in || 3600) * 1000) };
  return cachedToken.token;
}

function localMsisdn(raw: string): string {
  // Airtel attend le numéro SANS indicatif pays (ex 0331234567 → 331234567).
  let d = (raw || '').replace(/\D/g, '');
  if (d.startsWith('261')) d = d.slice(3);
  if (d.startsWith('0')) d = d.slice(1);
  return d;
}

/**
 * Initie un « Request to Pay » (push USSD vers le payeur). cash-in / recharge.
 * Retourne le transaction id Airtel en ref (pour le polling de statut).
 */
export async function initiateAirtelPayment(args: InitiateArgs): Promise<InitiateResult> {
  if (!airtelConfigured()) return { ok: false, error: 'airtel_not_configured' };
  try {
    const c = cfg();
    const token = await getToken();
    // TODO(au branchement) : confirmer le chemin Collection + chiffrement éventuel.
    const res = await fetch(`${c.base}/merchant/v1/payments/`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-Country': c.country,
        'X-Currency': c.currency,
      },
      body: JSON.stringify({
        reference: args.txRef,
        subscriber: { country: c.country, currency: c.currency, msisdn: localMsisdn(args.payerMsisdn) },
        transaction: { amount: Math.round(args.amount), country: c.country, currency: c.currency, id: randomUUID() },
      }),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: `airtel_initiate_${res.status}`, status: d?.status?.code };
    // d.data.transaction.id + d.status.success
    return { ok: true, ref: d?.data?.transaction?.id, status: 'pending' };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'airtel_error' };
  }
}

/** Statut d'une transaction (poll de secours si pas de notif). */
export async function airtelStatus(txId: string): Promise<{ status?: string; error?: string }> {
  if (!airtelConfigured()) return { error: 'airtel_not_configured' };
  try {
    const c = cfg();
    const token = await getToken();
    const res = await fetch(`${c.base}/standard/v1/payments/${txId}`, {
      headers: { Authorization: `Bearer ${token}`, 'X-Country': c.country, 'X-Currency': c.currency },
    });
    const d = await res.json().catch(() => ({}));
    return { status: d?.data?.transaction?.status }; // 'TS' (success) | 'TF' (failed) | 'TIP' (pending) — à normaliser
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'airtel_error' };
  }
}
