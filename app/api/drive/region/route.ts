/** Talk N Drive — région par GPS → catégories de véhicule réordonnées (adaptatif).
 *  GET ?lat=&lng=  → { country, vehicles:[{key,label,emoji,parcel}] }
 *  Toutes les catégories restent dispo ; on ne fait que mettre en avant les pertinentes. */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { reverseCountry } from '@/lib/geo';
import { vehiclesForCountry } from '@/lib/drive-vehicles';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const lat = parseFloat(req.nextUrl.searchParams.get('lat') || '');
  const lng = parseFloat(req.nextUrl.searchParams.get('lng') || '');
  const country = Number.isFinite(lat) && Number.isFinite(lng) ? await reverseCountry(lat, lng) : null;
  return NextResponse.json({ ok: true, country, vehicles: vehiclesForCountry(country) });
}
