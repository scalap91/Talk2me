'use server-only';

/**
 * Adaptateur MVola (Telma Madagascar) — API Merchant Pay. Pascal 2026-06-15.
 *
 * PRÊT À BRANCHER : il ne manque que les clés (portail developer.mvola.mg).
 * Pose ces variables d'env (PM2) pour activer :
 *   TALKTOME_PAY_PROVIDER=mvola
 *   MVOLA_CONSUMER_KEY=...        (Consumer Key de l'app)
 *   MVOLA_CONSUMER_SECRET=...     (Consumer Secret)
 *   MVOLA_ENV=sandbox|prod        (défaut sandbox)
 *   MVOLA_MERCHANT_MSISDN=...     (numéro marchand MVola, ex 0343500003 en sandbox)
 *   MVOLA_PARTNER_NAME=Talk2Me
 *   MVOLA_CALLBACK_URL=https://talk2me.fr/api/payments/mvola/callback
 *
 * Flux cash-in (recharge / paiement) :
 *   1) getToken()  → OAuth2 client_credentials (Basic key:secret)
 *   2) initiateMerchantPay() → débite le payeur vers le marchand ; renvoie un
 *      serverCorrelationId (on le stocke dans payment_intents.provider_ref)
 *   3) MVola appelle MVOLA_CALLBACK_URL quand c'est payé → /api/payments/mvola/callback
 *      → markIntentPaid() → crédit wallet. (ou polling getStatus en secours)
 *
 * ⚠️ À CONFIRMER au branchement (selon la doc exacte du portail) : noms de champs,
 * scope, et la DEVISE — MVola encaisse en Ariary (Ar), le wallet est en centimes
 * d'euro aujourd'hui. La réconciliation MGA↔unité wallet se décide avec Pascal au go-live.
 */

import { randomUUID } from 'crypto';

function cfg() {
  const env = (process.env.MVOLA_ENV || 'sandbox').toLowerCase();
  return {
    key: process.env.MVOLA_CONSUMER_KEY || '',
    secret: process.env.MVOLA_CONSUMER_SECRET || '',
    base: env === 'prod' ? 'https://api.mvola.mg' : 'https://devapi.mvola.mg',
    merchant: process.env.MVOLA_MERCHANT_MSISDN || '',
    partner: process.env.MVOLA_PARTNER_NAME || 'Talk2Me',
    callback: process.env.MVOLA_CALLBACK_URL || '',
    env,
  };
}

export function mvolaConfigured(): boolean {
  const c = cfg();
  return !!(c.key && c.secret && c.merchant);
}

let cachedToken: { token: string; exp: number } | null = null;

async function getToken(): Promise<string> {
  const c = cfg();
  if (cachedToken && cachedToken.exp > Date.now() + 30_000) return cachedToken.token;
  const basic = Buffer.from(`${c.key}:${c.secret}`).toString('base64');
  const res = await fetch(`${c.base}/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cache-Control': 'no-cache',
    },
    body: 'grant_type=client_credentials&scope=EXT_INT_MVOLA_SCOPE_PROXY',
  });
  if (!res.ok) throw new Error(`mvola_token_${res.status}`);
  const d = await res.json();
  cachedToken = { token: d.access_token, exp: Date.now() + (Number(d.expires_in || 3600) * 1000) };
  return cachedToken.token;
}

function isoNoMs(): string {
  // MVola attend un format type 2024-01-01T10:00:00.000Z
  return new Date().toISOString();
}

/**
 * Initie un paiement Merchant Pay (le payeur `payerMsisdn` paie le marchand).
 * Retourne { serverCorrelationId, txRef } — txRef = notre référence (= intent.id).
 */
export async function initiateMerchantPay(args: {
  amount: number;            // entier (Ariary, à confirmer)
  payerMsisdn: string;       // numéro du payeur
  description?: string;
  txRef: string;             // notre référence (payment_intent.id)
}): Promise<{ ok: boolean; serverCorrelationId?: string; status?: string; error?: string }> {
  if (!mvolaConfigured()) return { ok: false, error: 'mvola_not_configured' };
  try {
    const c = cfg();
    const token = await getToken();
    const correlationId = randomUUID();
    const body = {
      amount: String(Math.round(args.amount)),
      currency: 'Ar',
      descriptionText: (args.description || 'Talk2Me').replace(/[^A-Za-z0-9 ]/g, '').slice(0, 50) || 'Talk2Me',
      requestDate: isoNoMs(),
      requestingOrganisationTransactionReference: args.txRef,
      originalTransactionReference: '',
      debitParty: [{ key: 'msisdn', value: args.payerMsisdn }],
      creditParty: [{ key: 'msisdn', value: c.merchant }],
      metadata: [
        { key: 'partnerName', value: c.partner },
        { key: 'fc', value: 'USD' },
        { key: 'amountFc', value: '1' },
      ],
    };
    const res = await fetch(`${c.base}/mvola/mm/transactions/type/merchantpay/1.0.0/`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Version: '1.0',
        'X-CorrelationID': correlationId,
        UserLanguage: 'FR',
        UserAccountIdentifier: `msisdn;${c.merchant}`,
        partnerName: c.partner,
        'Content-Type': 'application/json',
        'X-Callback-URL': c.callback,
        'Cache-Control': 'no-cache',
      },
      body: JSON.stringify(body),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: `mvola_initiate_${res.status}`, status: d?.status };
    // d.serverCorrelationId + d.status ('pending')
    return { ok: true, serverCorrelationId: d.serverCorrelationId, status: d.status };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'mvola_error' };
  }
}

/** Vérifie le statut d'une transaction (secours si pas de callback). */
export async function getStatus(serverCorrelationId: string): Promise<{ status?: string; error?: string }> {
  if (!mvolaConfigured()) return { error: 'mvola_not_configured' };
  try {
    const c = cfg();
    const token = await getToken();
    const res = await fetch(`${c.base}/mvola/mm/transactions/type/merchantpay/1.0.0/status/${serverCorrelationId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Version: '1.0',
        'X-CorrelationID': randomUUID(),
        UserLanguage: 'FR',
        UserAccountIdentifier: `msisdn;${c.merchant}`,
        partnerName: c.partner,
        'Cache-Control': 'no-cache',
      },
    });
    const d = await res.json().catch(() => ({}));
    return { status: d?.status }; // 'completed' | 'pending' | 'failed'
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'mvola_error' };
  }
}
