/**
 * Talk2Me — Mes GAINS (Pascal 2026-07-15). GET → ce que J'AI gagné (encaissé + en attente).
 * Chiffres RÉELS agrégés depuis l'escrow/wallet (getEarnings), aucune invention.
 * Sert au menu « Mes gains » du liveur (avec bouton masquer). Devise du marché (MGA 1:1).
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { getEarnings } from '@/lib/escrow';
import { MARKET_CURRENCY, formatMoney } from '@/lib/money';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const e = getEarnings(me.id, MARKET_CURRENCY);
  return NextResponse.json({
    ok: true,
    totalCents: e.totalCents,
    releasedCents: e.releasedCents,
    pendingCents: e.pendingCents,
    currency: e.currency,
    totalLabel: formatMoney(e.totalCents, e.currency),
    releasedLabel: formatMoney(e.releasedCents, e.currency),
    pendingLabel: formatMoney(e.pendingCents, e.currency),
  });
}
