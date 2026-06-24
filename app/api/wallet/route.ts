/**
 * Talk2Me #427 — GET /api/wallet : solde + historique des transactions.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { getWalletBalance, getWalletTransactions } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Devise du MARCHÉ : l'user voit UNE seule devise, celle de son pays. On démarre
// à Madagascar → Ariary (MGA). En France ce serait EUR. Le système reste
// multi-devise EN BASE (chaque ligne porte sa devise), mais l'AFFICHAGE est mono :
// « si on est à Mada c'est l'Ariary qui parle » (Pascal 2026-06-23).
const MARKET_CURRENCY = process.env.MARKET_CURRENCY || 'MGA';

export async function GET(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  return NextResponse.json({
    currency: MARKET_CURRENCY,
    balance_cents: getWalletBalance(me.id, MARKET_CURRENCY),
    transactions: getWalletTransactions(me.id, 50),
  });
}
