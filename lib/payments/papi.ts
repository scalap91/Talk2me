'use server-only';

/**
 * Talk2Me — Client PaPi (https://docs.papi.mg), Pascal 2026-06-23. Marché Madagascar.
 *
 * PaPi = agrégateur d'ENCAISSEMENT malgache : une seule clé API → MVola, Orange
 * Money, Airtel Money, Visa, BRED, en Ariary (MGA). PaPi ne fait PAS de payout
 * (le reversement reste notre module manuel/batch). Voir [[project_talk2me_papi_payment]].
 *
 * Module PORTABLE (doctrine [[project_airbizness_provider_natif]]) : ce fichier ne
 * dépend que de fetch + 4 variables d'env, aucune dépendance applicative. Pour le
 * déménager : copier ce fichier + la route /api/payments/papi/callback + poser les
 * env. L'intégration au wallet/escrow se fait dans lib/payments.ts (startTopup).
 *
 *   PAPI_API_KEY        clé API du dashboard (header "Token"). Sans elle → non configuré.
 *   PAPI_API_URL        défaut https://app.papi.mg/dashboard/api/payment-links
 *   PAPI_PUBLIC_BASE    base publique de NOTRE app pour les URLs de retour/notif
 *                       (défaut https://dev.talk2me.fr)
 *   PAPI_TEST_MODE      'false' pour la prod ; sinon isTestMode=true (sandbox).
 *
 * Sécurité : le notificationToken renvoyé à la création est un SECRET par-paiement
 * (sert à authentifier le callback). On le stocke côté serveur, jamais exposé au
 * client ni aux tuyaux IA ([[feedback_talk2me_pii_air_gap]]).
 */

const DEFAULT_URL = 'https://app.papi.mg/dashboard/api/payment-links';

export type PapiProvider = 'MVOLA' | 'ORANGE_MONEY' | 'ARTEL_MONEY' | 'BRED';

export function papiConfigured(): boolean {
  return !!(process.env.PAPI_API_KEY && process.env.PAPI_API_KEY.length > 8);
}

export function papiTestMode(): boolean {
  return process.env.PAPI_TEST_MODE !== 'false';
}

function publicBase(): string {
  return (process.env.PAPI_PUBLIC_BASE || 'https://dev.talk2me.fr').replace(/\/+$/, '');
}

export type PapiCreateArgs = {
  amountAriary: number;        // ENTIER en Ariary (MGA, pas de centimes ; min 300)
  reference: string;           // notre identifiant unique (= payment_intent.id)
  description: string;         // ≤255 car
  clientName: string;
  provider?: PapiProvider;     // optionnel : restreindre à un opérateur ; sinon PaPi propose tout
  payerEmail?: string | null;
  payerPhone?: string | null;
  validDurationMin?: number;   // validité du lien en minutes (défaut 60)
};

export type PapiCreateResult = {
  ok: boolean;
  paymentLink?: string;        // URL pay.papi.mg → rediriger le client
  notificationToken?: string;  // SECRET à stocker (vérif du callback)
  error?: string;
};

/**
 * Crée un lien de paiement PaPi. Le client sera redirigé sur paymentLink ; à la
 * fin PaPi POST sur notre notificationUrl + redirige sur success/failureUrl.
 */
export async function papiCreatePaymentLink(args: PapiCreateArgs): Promise<PapiCreateResult> {
  const key = process.env.PAPI_API_KEY;
  if (!key) return { ok: false, error: 'papi_not_configured' };
  const amount = Math.round(args.amountAriary);
  if (amount < 300) return { ok: false, error: 'amount_too_small' }; // min PaPi = 300 Ar

  const base = publicBase();
  const body: Record<string, unknown> = {
    amount,
    clientName: args.clientName.slice(0, 120),
    reference: args.reference,
    description: (args.description || 'Paiement Talk2Me').slice(0, 255),
    successUrl: `${base}/wallet?pay=success&ref=${encodeURIComponent(args.reference)}`,
    failureUrl: `${base}/wallet?pay=failure&ref=${encodeURIComponent(args.reference)}`,
    notificationUrl: `${base}/api/payments/papi/callback`,
    validDuration: Math.max(1, args.validDurationMin ?? 60),
    isTestMode: papiTestMode(),
  };
  if (args.provider) body.provider = args.provider;
  if (args.payerEmail) body.payerEmail = args.payerEmail;
  if (args.payerPhone) body.payerPhone = args.payerPhone;
  if (papiTestMode()) body.testReason = 'Talk2Me sandbox';

  try {
    const r = await fetch(process.env.PAPI_API_URL || DEFAULT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Token: key },
      body: JSON.stringify(body),
    });
    const json = await r.json().catch(() => null);
    if (!r.ok || !json) return { ok: false, error: `papi_http_${r.status}` };
    const data = json.data || json;
    const paymentLink: string | undefined = data?.paymentLink;
    const notificationToken: string | undefined = data?.notificationToken;
    if (!paymentLink) return { ok: false, error: 'no_payment_link' };
    return { ok: true, paymentLink, notificationToken };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'papi_network_error' };
  }
}

/** Champs utiles du callback PaPi (POST sur notre notificationUrl). */
export type PapiNotification = {
  paymentStatus?: 'SUCCESS' | 'PENDING' | 'FAILED';
  paymentMethod?: string;     // MVOLA | ARTEL_MONEY | ORANGE_MONEY | BRED
  currency?: string;          // toujours MGA
  amount?: number;
  fee?: number;
  paymentReference?: string;  // = notre reference (payment_intent.id)
  merchantPaymentReference?: string; // ref interne fournisseur
  notificationToken?: string; // doit matcher celui stocké à la création
  message?: string;
  payerEmail?: string;
  payerPhone?: string;
};
