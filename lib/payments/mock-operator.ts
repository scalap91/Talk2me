import 'server-only';

/**
 * SANDBOX opérateur mobile money FACTICE (Pascal 2026-07-09).
 *
 * But : simuler collect (encaissement) ET disburse (versement/cash-out) de bout en bout,
 * SANS vrai opérateur ni HTTP, pour développer/tester les rails (Audit #01 cash-out, #02
 * HTTP OM/Airtel) sans toucher au LIVE ni attendre les clés Orange/Airtel.
 *
 * Activation : env `MM_MOCK=1` (ou `TALK2ME_PAY_PROVIDER=mock`). Quand actif, `getAdapter()`
 * renvoie CE mock au lieu des modules réels. Issues configurables par env :
 *   MM_MOCK_COLLECT  = success | pending | fail   (défaut success)
 *   MM_MOCK_DISBURSE = success | fail             (défaut success)
 *
 * ⚠️ Jamais actif en prod réelle : c'est un simulateur. Le rail LIVE reste à vérifier
 * explicitement (feedback_verifier_rail_paiement).
 */
import type { MobileMoneyAdapter, OperatorKey, InitiateArgs, InitiateResult, DisburseArgs, DisburseResult } from '@/lib/payments/operators';
import { OPERATOR_LABELS } from '@/lib/payments/operators';

export function mockAdapter(op: OperatorKey): MobileMoneyAdapter {
  const collect = (process.env.MM_MOCK_COLLECT || 'success').toLowerCase();
  const disburse = (process.env.MM_MOCK_DISBURSE || 'success').toLowerCase();
  return {
    key: op,
    label: `MOCK ${OPERATOR_LABELS[op]}`,
    isConfigured: () => true,
    initiate: async (a: InitiateArgs): Promise<InitiateResult> => {
      if (collect === 'fail') return { ok: false, error: 'mock_collect_declined' };
      const status = collect === 'pending' ? 'pending' : 'success';
      // Orange = WebPay (redirection) → on renvoie une URL de confirmation sandbox (comme le vrai WebPay).
      // MVola / Airtel = push USSD sur le téléphone → pas d'URL, on règle via le poll de statut.
      if (op === 'orange') {
        return { ok: true, ref: 'mock-' + a.txRef, status, checkoutUrl: `/api/payments/sandbox/confirm?intent=${encodeURIComponent(a.txRef)}` };
      }
      return { ok: true, ref: 'mock-' + a.txRef, status };
    },
    status: async (): Promise<{ status?: string; error?: string }> => ({
      status: collect === 'pending' ? 'pending' : 'success',
    }),
    disburse: async (a: DisburseArgs): Promise<DisburseResult> => {
      if (disburse === 'fail') return { ok: false, error: 'mock_disburse_declined' };
      return { ok: true, ref: 'mockpay-' + a.txRef, status: 'success' };
    },
  };
}
