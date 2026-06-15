/**
 * POST /api/payments/mvola/callback (Pascal 2026-06-15)
 * Webhook MVola : appelé quand un paiement Merchant Pay est confirmé. On retrouve
 * l'intent via notre référence (requestingOrganisationTransactionReference = intent.id)
 * ou le serverCorrelationId, puis on crédite le wallet (idempotent).
 * ⚠️ Champs exacts à confirmer avec la doc MVola au branchement des clés.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getIntent, markIntentPaid, markIntentFailed } from '@/lib/payments';
import { getDb } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* */ }

  const txRef = (body.requestingOrganisationTransactionReference || body.transactionReference || '') as string;
  const serverCorrelationId = (body.serverCorrelationId || '') as string;
  const status = String(body.transactionStatus || body.status || '').toLowerCase();

  // Retrouve l'intent : par notre ref directe, sinon par provider_ref (corrélation).
  let intentId = txRef;
  if (!getIntent(intentId) && serverCorrelationId) {
    const row = getDb().prepare('SELECT id FROM payment_intents WHERE provider_ref = ?').get(serverCorrelationId) as { id?: string } | undefined;
    if (row?.id) intentId = row.id;
  }
  if (!intentId || !getIntent(intentId)) return NextResponse.json({ ok: true, ignored: 'unknown_ref' });

  if (status === 'completed' || status === 'success' || status === 'successful') {
    markIntentPaid(intentId, serverCorrelationId || null);
  } else if (status === 'failed' || status === 'rejected') {
    markIntentFailed(intentId);
  }
  return NextResponse.json({ ok: true });
}
