/**
 * Talk2Me — Ma ZONE (ville) de contributeur (Pascal 2026-08-08).
 * Sert au routage formation par zone : les recrues que j'envoie tombent chez les validateurs de MA ville.
 * POST { city, region? } → fixe/actualise ma ville. Contributeur uniquement.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { getContributor, setContributorCity } from '@/lib/network';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!getContributor(me.id)) return NextResponse.json({ error: 'not_contributor' }, { status: 403 });

  let b: { city?: string; region?: string } = {};
  try { b = await req.json(); } catch { /* vide */ }
  const city = typeof b.city === 'string' ? b.city.trim().slice(0, 80) : '';
  if (!city) return NextResponse.json({ error: 'city_required' }, { status: 400 });
  setContributorCity(me.id, city, typeof b.region === 'string' ? b.region.trim().slice(0, 80) : null);
  return NextResponse.json({ ok: true, city });
}
