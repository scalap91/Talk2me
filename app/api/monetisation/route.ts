/**
 * Talk2Me — Monétisation (Pascal 2026-06-19).
 * Résumé RÉEL des gains de l'user (ledger wallet_transactions, ventilé par source)
 * + solde courant. Sert l'onglet Monétisation du profil. Aucun chiffre inventé :
 * 0 tant qu'il n'y a pas de transaction.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { getMonetisationSummary, getWalletBalance } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const summary = getMonetisationSummary(me.id);
  return NextResponse.json({ ...summary, balance_cents: getWalletBalance(me.id) });
}
