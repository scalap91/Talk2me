import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { acceptOffer } from '@/lib/transport';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST — le demandeur accepte une offre → bloque l'escrow + assigne le transporteur.
export async function POST(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  let b: { offer_id?: string } = {};
  try { b = await req.json(); } catch { return NextResponse.json({ error: 'bad_body' }, { status: 400 }); }
  if (!b.offer_id) return NextResponse.json({ error: 'offer_id_required' }, { status: 400 });
  const r = acceptOffer(b.offer_id, me.id);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
  return NextResponse.json({ ok: true, escrow_id: r.escrow_id, request: r.request });
}
