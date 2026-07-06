/**
 * Console ADMIN — traitement des commandes d'import. Super-admin only.
 * GET  → toutes les commandes + l'adresse FRANCE du transporteur (où faire livrer SHEIN/TEMU).
 * PATCH { id, status?, fr_tracking?, mg_tracking? } → fait avancer le suivi.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { isAdminCapable } from '@/lib/permissions';
import { listAllImportOrders, updateImportStatus, type ImportStatus } from '@/lib/import-orders';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STATUSES: ImportStatus[] = ['to_order', 'ordered', 'received_fr', 'shipped_mg', 'delivered', 'cancelled'];

function gate(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  return me && isAdminCapable(me.id, me.email) ? me : null;
}

export async function GET(req: NextRequest) {
  if (!gate(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  return NextResponse.json({
    ok: true,
    fr_address: process.env.TRANSPORTER_FR_ADDRESS || '⚠️ Adresse France du transporteur non configurée (env TRANSPORTER_FR_ADDRESS)',
    orders: listAllImportOrders(),
  });
}

export async function PATCH(req: NextRequest) {
  if (!gate(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const b = await req.json().catch(() => ({} as Record<string, unknown>));
  const id = typeof b.id === 'string' ? b.id : '';
  const status = typeof b.status === 'string' && STATUSES.includes(b.status as ImportStatus) ? (b.status as ImportStatus) : undefined;
  if (!id || (!status && b.fr_tracking === undefined && b.mg_tracking === undefined)) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  const order = updateImportStatus(id, status || ('to_order' as ImportStatus), {
    fr_tracking: typeof b.fr_tracking === 'string' ? b.fr_tracking : undefined,
    mg_tracking: typeof b.mg_tracking === 'string' ? b.mg_tracking : undefined,
  });
  return NextResponse.json({ ok: !!order, order });
}
