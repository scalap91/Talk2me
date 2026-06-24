/**
 * Talk2Me — Matching A→B (Brique B) : trajets ouverts qui rapprochent le colis de sa
 * destination depuis sa position courante. GET ?shipment_id=
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { findCarriers } from '@/lib/shipment';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const id = req.nextUrl.searchParams.get('shipment_id');
  if (!id) return NextResponse.json({ error: 'shipment_id_required' }, { status: 400 });
  return NextResponse.json({ ok: true, candidates: findCarriers(id) });
}
