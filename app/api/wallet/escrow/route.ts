/**
 * Talk2Me — Escrow API (Pascal 2026-06-09).
 * POST : verrouille un paiement (l'appelant = acheteur, son wallet est débité).
 * GET  : mes escrows (en tant qu'acheteur + en tant que bénéficiaire) + total bloqué.
 * ⚠️ MODE TEST (argent fictif) tant qu'Orange Money/Paysend pas LIVE.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { lockEscrow, listEscrowsForUser, type EscrowPart } from '@/lib/escrow';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  let body: { amount_cents?: number; breakdown?: EscrowPart[]; order_ref?: string } = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'bad_body' }, { status: 400 }); }
  if (!Array.isArray(body.breakdown) || !body.amount_cents) return NextResponse.json({ error: 'missing_fields' }, { status: 400 });
  const r = lockEscrow(me.id, body.amount_cents, body.breakdown, body.order_ref);
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: r.error === 'insufficient_funds' ? 402 : 400 });
  return NextResponse.json(r);
}

export async function GET(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  return NextResponse.json({ ok: true, ...listEscrowsForUser(me.id) });
}
