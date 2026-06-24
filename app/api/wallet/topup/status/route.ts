/**
 * GET /api/wallet/topup/status?intent=<id> (Pascal 2026-06-23).
 * Suivi d'une recharge en attente (push USSD MVola : pas de redirection → le
 * client poll ici). Vérifie le statut côté fournisseur, règle si terminé, et
 * renvoie le statut normalisé + le solde si payé. L'intent doit appartenir à l'user.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { getIntent, pollIntent } from '@/lib/payments';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const id = req.nextUrl.searchParams.get('intent') || '';
  const intent = id ? getIntent(id) : null;
  if (!intent || intent.user_id !== me.id) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const r = await pollIntent(id);
  return NextResponse.json({ ok: true, ...r });
}
