'use server-only';

/**
 * Routeur mobile money Madagascar — Pascal 2026-06-15.
 *
 * À Madagascar un seul opérateur ne suffit pas : l'argent d'un payeur Orange ne
 * passe pas par un marchand MVola. Ce routeur unifie les 3 opérateurs derrière
 * une même interface et choisit le bon adaptateur selon le PRÉFIXE du numéro
 * (ou un opérateur forcé). Chaque adaptateur garde sa propre onboarding/clés.
 *
 * Préfixes mobiles malgaches (indicatif +261, format local 03X) :
 *   Telma  (MVola)        → 034, 038
 *   Orange (Orange Money) → 032, 037
 *   Airtel (Airtel Money) → 033
 *
 * Voir [[project_talk2me_payment_rail]] et [[project_talk2me_commerce_entry_points]].
 */

export type OperatorKey = 'mvola' | 'orange' | 'airtel';

export type InitiateArgs = {
  amount: number;        // entier dans la devise opérateur (Ariary, à confirmer)
  payerMsisdn: string;   // numéro du payeur (format souple, normalisé par l'adaptateur)
  description?: string;
  txRef: string;         // notre référence = payment_intent.id
};

export type InitiateResult = {
  ok: boolean;
  ref?: string;          // référence transaction côté opérateur (→ provider_ref)
  checkoutUrl?: string;  // URL de redirection (Orange WebPay) ; absent si push USSD (MVola/Airtel)
  status?: string;
  error?: string;
};

// Versement (disbursement / payout) — l'API SORTANTE de l'opérateur (distincte de l'encaissement).
export type DisburseArgs = {
  amount: number;        // entier dans la devise opérateur (Ariary)
  payeeMsisdn: string;   // numéro du bénéficiaire
  description?: string;
  txRef: string;         // notre référence = payout.id
};
export type DisburseResult = { ok: boolean; ref?: string; status?: string; error?: string };

export interface MobileMoneyAdapter {
  key: OperatorKey;
  label: string;
  isConfigured(): boolean;
  initiate(args: InitiateArgs): Promise<InitiateResult>;
  status(ref: string): Promise<{ status?: string; error?: string }>;
  // Versement (payout). Optionnel tant que le vrai disbursement opérateur n'est pas câblé
  // (tâches Audit #01/#02). Le sandbox mock l'implémente pour tester le cash-out E2E.
  disburse?(args: DisburseArgs): Promise<DisburseResult>;
}

/** Sandbox opérateur FACTICE actif ? (env MM_MOCK=1 ou provider 'mock'). Pascal 2026-07-09. */
export function mmMockEnabled(): boolean {
  const p = process.env.TALK2ME_PAY_PROVIDER || process.env.TALKTOME_PAY_PROVIDER;
  return process.env.MM_MOCK === '1' || p === 'mock';
}

export const OPERATOR_LABELS: Record<OperatorKey, string> = {
  mvola: 'MVola',
  orange: 'Orange Money',
  airtel: 'Airtel Money',
};

/** Normalise un numéro malgache vers le format local 03XXXXXXXX. */
export function normalizeMsisdn(raw: string): string {
  let d = (raw || '').replace(/\D/g, '');
  if (d.startsWith('261')) d = '0' + d.slice(3);     // +261 34… → 034…
  if (d.length === 9 && d.startsWith('3')) d = '0' + d; // 34… (0 oublié) → 034…
  return d;
}

/** Devine l'opérateur depuis le numéro. null si préfixe inconnu. */
export function detectOperator(raw: string): OperatorKey | null {
  const p = normalizeMsisdn(raw).slice(0, 3);
  if (p === '034' || p === '038') return 'mvola';
  if (p === '032' || p === '037') return 'orange';
  if (p === '033') return 'airtel';
  return null;
}

/** Construit l'adaptateur uniforme pour un opérateur (wrap des modules dédiés). */
export async function getAdapter(op: OperatorKey): Promise<MobileMoneyAdapter> {
  // SANDBOX : opérateur factice (collect + disburse simulés) quand MM_MOCK=1. Pascal 2026-07-09.
  if (mmMockEnabled()) {
    const { mockAdapter } = await import('@/lib/payments/mock-operator');
    return mockAdapter(op);
  }
  if (op === 'mvola') {
    const m = await import('@/lib/payments/mvola');
    return {
      key: 'mvola',
      label: OPERATOR_LABELS.mvola,
      isConfigured: m.mvolaConfigured,
      initiate: async (a) => {
        const r = await m.initiateMerchantPay({ amount: a.amount, payerMsisdn: a.payerMsisdn, description: a.description, txRef: a.txRef });
        return { ok: r.ok, ref: r.serverCorrelationId, status: r.status, error: r.error };
      },
      status: (ref) => m.getStatus(ref),
    };
  }
  if (op === 'orange') {
    const o = await import('@/lib/payments/orange-money');
    return {
      key: 'orange',
      label: OPERATOR_LABELS.orange,
      isConfigured: o.orangeConfigured,
      initiate: (a) => o.initiateOrangePayment(a),
      status: (ref) => o.orangeStatus(ref),
    };
  }
  // airtel
  const ai = await import('@/lib/payments/airtel-money');
  return {
    key: 'airtel',
    label: OPERATOR_LABELS.airtel,
    isConfigured: ai.airtelConfigured,
    initiate: (a) => ai.initiateAirtelPayment(a),
    status: (ref) => ai.airtelStatus(ref),
  };
}

/**
 * Résout l'adaptateur à utiliser :
 *  - `forced` si fourni (provider MVola/Orange/Airtel explicite),
 *  - sinon détection auto par le numéro du payeur.
 * Retourne null si on ne peut pas déterminer l'opérateur.
 */
export async function resolveAdapter(forced: OperatorKey | undefined, msisdn: string): Promise<MobileMoneyAdapter | null> {
  const op = forced || detectOperator(msisdn);
  if (!op) return null;
  return getAdapter(op);
}

/** Au moins un opérateur mobile money est-il configuré (clés posées) ? */
export async function anyOperatorConfigured(): Promise<OperatorKey[]> {
  const ops: OperatorKey[] = ['mvola', 'orange', 'airtel'];
  const out: OperatorKey[] = [];
  for (const op of ops) {
    const a = await getAdapter(op);
    if (a.isConfigured()) out.push(op);
  }
  return out;
}
