/**
 * Talk2Me — Escrow règlement (Pascal 2026-06-09).
 * POST { action: 'release' | 'refund' } sur un escrow.
 * Sécurité : seul l'ACHETEUR (qui a payé) peut libérer (= confirmer la livraison)
 * ou demander le remboursement. (MVP test ; un arbitrage plateforme viendra ensuite.)
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { getEscrow, releaseEscrow, refundEscrow } from '@/lib/escrow';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await context.params;
  const esc = getEscrow(id);
  if (!esc) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (esc.buyer_id !== me.id) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  let body: { action?: string } = {};
  try { body = await req.json(); } catch { /* */ }
  const r = body.action === 'refund' ? refundEscrow(id) : releaseEscrow(id);
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: 400 });
  return NextResponse.json(r);
}
