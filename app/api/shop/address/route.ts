/** Talk2Me — Adresse de livraison (universelle : GPS socle mondial + repère + adresse libre). GET/POST. */
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
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const num = (v: unknown): number | null => {
    const n = typeof v === 'string' ? parseFloat(v) : typeof v === 'number' ? v : NaN;
    return Number.isFinite(n) ? n : null;
  };
  const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null);
  saveShippingAddress(me.id, {
    full_name: str(b.full_name),
    line1: str(b.line1),
    city: str(b.city),
    zip: str(b.zip),
    country: str(b.country),
    phone: str(b.phone),
    lat: num(b.lat),
    lng: num(b.lng),
    landmark: str(b.landmark),
    label: str(b.label),
  });
  return NextResponse.json({ ok: true });
}
