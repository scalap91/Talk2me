/**
 * Talk2Me — API admin REVERSEMENT manuel (Pascal 2026-06-23).
 * GET  → bénéficiaires à payer (solde wallet > 0) + derniers reversements manuels.
 * POST → { user_id, amount_cents, msisdn?, note? } : enregistre un reversement
 *        effectué à la main (débite le wallet + trace + Telegram). Admin only.
 * Voir [[project_talk2me_papi_payment]] (jambe "reverser" = manuel/batch bootstrap).
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { isAiOpsAdmin } from '@/lib/ai-ops/auth';
import { listOwedBeneficiaries, recordManualPayout } from '@/lib/payments';
import { getDb } from '@/lib/db';
import { notifyTelegram } from '@/lib/ai-ops/telegram';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function guard(req: NextRequest) {
  const user = getCurrentUserFromRequest(req);
  if (!user) return { error: NextResponse.json({ error: 'unauthorized' }, { status: 401 }) };
  if (!isAiOpsAdmin(user.id, (user as { email?: string }).email))
    return { error: NextResponse.json({ error: 'forbidden' }, { status: 403 }) };
  return { user };
}

export async function GET(req: NextRequest) {
  const g = guard(req);
  if (g.error) return g.error;
  const owed = listOwedBeneficiaries(1);
  let recent: unknown[] = [];
  try {
    recent = getDb().prepare(
      "SELECT id, user_id, amount_cents, msisdn, created_at FROM payouts WHERE provider = 'manual' ORDER BY created_at DESC LIMIT 30"
    ).all();
  } catch { /* table absente */ }
  const total = owed.reduce((s, b) => s + b.balance_cents, 0);
  return NextResponse.json({ ok: true, owed, total_owed_cents: total, recent });
}

export async function POST(req: NextRequest) {
  const g = guard(req);
  if (g.error) return g.error;
  let body: { user_id?: string; amount_cents?: number; msisdn?: string; note?: string } = {};
  try { body = await req.json(); } catch { /* */ }
  if (!body.user_id || !body.amount_cents) return NextResponse.json({ error: 'missing_fields' }, { status: 400 });

  const r = recordManualPayout({
    userId: body.user_id,
    amountCents: Math.round(body.amount_cents),
    msisdn: body.msisdn || null,
    note: body.note || null,
  });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
  notifyTelegram(`💸 Reversement manuel enregistré : ${Math.round(body.amount_cents)} Ar → user ${body.user_id}${body.msisdn ? ' (' + body.msisdn + ')' : ''}. Solde restant ${r.balance_cents} Ar.`);
  return NextResponse.json({ ok: true, balance_cents: r.balance_cents, payout_id: r.payout_id });
}
