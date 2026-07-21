/**
 * POST /api/plat-maison/reactivate { shop_id, item_id } — (ré)active UN PLAT pour 24h.
 * Pascal 2026-07-19 : « c'est sur la fiche plat qu'on prolonge ». Owner du shop only.
 * → { ok, active_until }.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { activatePlatMaisonDish } from '@/lib/simple-shop';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  let body: { shop_id?: string; item_id?: string } = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'bad_body' }, { status: 400 }); }
  if (!body.shop_id || !body.item_id) return NextResponse.json({ error: 'missing_fields' }, { status: 400 });
  const activeUntil = activatePlatMaisonDish(body.shop_id, body.item_id, me.id);
  if (!activeUntil) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.json({ ok: true, active_until: activeUntil });
}
