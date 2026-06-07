/**
 * Talk2Me #427 — POST /api/wallet/topup-test : recharge de TEST (+10€).
 *
 * ⚠️ TEMPORAIRE : crédite le Wallet sans paiement réel, pour tester le boost
 * avant la vraie recharge Stripe. À SUPPRIMER quand Stripe LIVE est branché
 * (doctrine [[feedback-verifier-rail-paiement]]). Réservé au user connecté.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { addWalletTransaction, getWalletBalance } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  addWalletTransaction(me.id, 1000, 'topup_test', 'Recharge test (+10 €)', Date.now(), null);
  return NextResponse.json({ ok: true, balance_cents: getWalletBalance(me.id) });
}
