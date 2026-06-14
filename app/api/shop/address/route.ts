/** Talk2Me — Adresse de livraison Shop. GET (la mienne) · POST (enregistrer). */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { getShippingAddress, saveShippingAddress } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  return NextResponse.json({ ok: true, address: getShippingAddress(me.id) });
}

export async function POST(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as Record<string, string>;
  saveShippingAddress(me.id, {
    full_name: b.full_name || null,
    line1: b.line1 || null,
    city: b.city || null,
    zip: b.zip || null,
    country: b.country || null,
    phone: b.phone || null,
  });
  return NextResponse.json({ ok: true });
}
