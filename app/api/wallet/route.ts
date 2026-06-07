/**
 * Talk2Me #427 — GET /api/wallet : solde + historique des transactions.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { getWalletBalance, getWalletTransactions } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  return NextResponse.json({
    balance_cents: getWalletBalance(me.id),
    transactions: getWalletTransactions(me.id, 50),
  });
}
