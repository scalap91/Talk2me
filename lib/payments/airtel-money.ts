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
 *   --- DÉCAISSEMENT (payout / fan-out vers les users) ---
 *   AIRTEL_PIN=...                  (PIN marchand de décaissement, 4 chiffres)
 *   AIRTEL_PUBLIC_KEY=...           (clé publique RSA Airtel, base64/PEM, pour chiffrer le PIN)
 *   AIRTEL_DISBURSE_PATH=/standard/v1/disbursements/   (override si v2 /merchant/v2/payouts/)
 *
 * Décaissement = on verse vers le wallet d'un destinataire. À Madagascar l'interop
 * inter-opérateurs existe (GSMA MMI) ; RESTE À PROUVER EN LIVE que ce payout accepte
 * un numéro hors-réseau (034 MVola / 032 Orange) ou seulement Airtel (033).
 *
 * ⚠️ À CONFIRMER au branchement (doc Airtel, .mg bloqué Incapsula → test live tranche) :
 * base URL exacte, version du décaissement (v1 disbursements vs v2 payouts), schéma
 * de chiffrement du PIN, noms de champs, normalisation des statuts (TS/TF/TIP).
 * Voir [[reference_talk2me_airtel_api]].
 */

import { randomUUID, publicEncrypt, constants as cryptoConstants } from 'crypto';
import type { InitiateArgs, InitiateResult } from '@/lib/payments/operators';

function cfg() {
  const env = (process.env.AIRTEL_ENV || 'sandbox').toLowerCase();
  return {
    clientId: process.env.AIRTEL_CLIENT_ID || '',
    clientSecret: process.env.AIRTEL_CLIENT_SECRET || '',
    base: env === 'prod' ? 'https://openapi.airtel.africa' : 'https://openapiuat.airtel.africa',
    country: process.env.AIRTEL_COUNTRY || 'MG',
    currency: process.env.AIRTEL_CURRENCY || 'MGA',
    pin: process.env.AIRTEL_PIN || '',
    publicKey: process.env.AIRTEL_PUBLIC_KEY || '',
    disbursePath: process.env.AIRTEL_DISBURSE_PATH || '/standard/v1/disbursements/',
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
    // Airtel poll le statut par NOTRE transaction.id → on le génère, on l'envoie, on le renvoie en ref.
    const txnId = args.txRef;
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
        transaction: { amount: Math.round(args.amount), country: c.country, currency: c.currency, id: txnId },
      }),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: `airtel_initiate_${res.status}`, status: d?.status?.code };
    // statut via notre txnId (GET /standard/v1/payments/{txnId})
    return { ok: true, ref: txnId, status: 'pending' };
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

// ─── DÉCAISSEMENT (payout / fan-out vers les users) ─────────────────────────
// C'est LA jambe "reverser". On verse vers le wallet d'un destinataire. Airtel
// exige (selon version) un PIN marchand chiffré RSA avec leur clé publique.

/** Le décaissement est-il configurable ? (clés + PIN posés). */
export function airtelDisbursementConfigured(): boolean {
  const c = cfg();
  return !!(c.clientId && c.clientSecret && c.pin);
}

/**
 * Chiffre le PIN marchand avec la clé publique RSA d'Airtel (RSA/ECB/PKCS1) → base64.
 * Si aucune clé publique posée, renvoie le PIN brut (le test live dira si Airtel
 * l'exige chiffré ; certaines versions sandbox acceptent le PIN clair).
 */
function encryptPin(pin: string, publicKeyB64OrPem: string): string {
  if (!publicKeyB64OrPem) return pin;
  let pem = publicKeyB64OrPem.trim();
  if (!pem.includes('BEGIN')) {
    // clé fournie en base64 brute → on l'enrobe en PEM SPKI
    const body = pem.replace(/\s+/g, '').match(/.{1,64}/g)?.join('\n') || pem;
    pem = `-----BEGIN PUBLIC KEY-----\n${body}\n-----END PUBLIC KEY-----`;
  }
  const enc = publicEncrypt({ key: pem, padding: cryptoConstants.RSA_PKCS1_PADDING }, Buffer.from(pin, 'utf8'));
  return enc.toString('base64');
}

/**
 * Verse `amount` (Ariary) vers le wallet `payeeMsisdn`. txRef = notre référence
 * (= payout.id). Retourne le transaction id Airtel pour le suivi.
 *
 * ⚠️ Interop : on envoie le numéro tel quel ; le test live dira si Airtel route
 * vers un 034 (MVola) / 032 (Orange) ou refuse hors-réseau.
 */
export async function initiateAirtelDisbursement(args: {
  amount: number;
  payeeMsisdn: string;
  txRef: string;
}): Promise<{ ok: boolean; ref?: string; status?: string; error?: string }> {
  if (!airtelConfigured()) return { ok: false, error: 'airtel_not_configured' };
  if (!cfg().pin) return { ok: false, error: 'airtel_pin_missing' };
  try {
    const c = cfg();
    const token = await getToken();
    const txnId = args.txRef;
    const res = await fetch(`${c.base}${c.disbursePath}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-Country': c.country,
        'X-Currency': c.currency,
      },
      body: JSON.stringify({
        payee: { msisdn: localMsisdn(args.payeeMsisdn), currency: c.currency },
        reference: args.txRef,
        pin: encryptPin(c.pin, c.publicKey),
        transaction: { amount: Math.round(args.amount), id: txnId },
      }),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: `airtel_disburse_${res.status}`, status: d?.status?.code };
    return { ok: true, ref: txnId, status: d?.data?.transaction?.status || 'pending' };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'airtel_error' };
  }
}

/** Statut d'un décaissement. */
export async function airtelDisbursementStatus(txId: string): Promise<{ status?: string; error?: string }> {
  if (!airtelConfigured()) return { error: 'airtel_not_configured' };
  try {
    const c = cfg();
    const token = await getToken();
    const res = await fetch(`${c.base}/standard/v1/disbursements/${txId}`, {
      headers: { Authorization: `Bearer ${token}`, 'X-Country': c.country, 'X-Currency': c.currency },
    });
    const d = await res.json().catch(() => ({}));
    return { status: d?.data?.transaction?.status };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'airtel_error' };
  }
}
