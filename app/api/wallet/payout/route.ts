/**
 * POST /api/wallet/payout (Pascal 2026-06-15) — RETRAIT vendeur (cash-out).
 * { amount_cents, msisdn } → débite le wallet et verse vers le mobile money.
 * Sandbox : simulé (testable). MVola : refusé tant que les clés ne sont pas posées.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { requestPayout, currentProvider } from '@/lib/payments';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  let body: { amount_cents?: number; msisdn?: string } = {};
  try { body = await req.json(); } catch { /* */ }
  const cents = Math.round(Number(body.amount_cents) || 0);
  if (!cents || cents < 100) return NextResponse.json({ error: 'amount_too_small' }, { status: 400 });
  const r = await requestPayout({ userId: me.id, amountCents: cents, msisdn: body.msisdn || null });
  if (!r.ok) {
    const status = r.error === 'insufficient_balance' ? 400 : r.error?.includes('not_configured') ? 503 : 400;
    return NextResponse.json({ error: r.error, provider: currentProvider() }, { status });
  }
  return NextResponse.json({ ok: true, balance_cents: r.balance_cents, payout_id: r.payout_id });
}
