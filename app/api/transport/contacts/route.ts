/**
 * Talk2Me — Contacts CLOISONNÉS d'un colis (Brique C). Sans numéro de téléphone (PII air-gap).
 * GET  ?shipment_id= → qui je peux joindre (voisins de chaîne + oversight vendeur / client↔porteur).
 * POST { shipment_id, to } → ping masqué le destinataire autorisé (notification, pas de n°).
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { getContacts, pingContact } from '@/lib/shipment';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const id = req.nextUrl.searchParams.get('shipment_id');
  if (!id) return NextResponse.json({ error: 'shipment_id_required' }, { status: 400 });
  return NextResponse.json({ ok: true, contacts: getContacts(id, me.id) });
}

export async function POST(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  let b: { shipment_id?: string; to?: string } = {};
  try { b = await req.json(); } catch { return NextResponse.json({ error: 'bad_body' }, { status: 400 }); }
  if (!b.shipment_id || !b.to) return NextResponse.json({ error: 'bad_args' }, { status: 400 });
  const r = pingContact(b.shipment_id, me.id, b.to);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}
