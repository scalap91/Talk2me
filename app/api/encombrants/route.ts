import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { getSchedule, setSchedule, nextCollectionDate } from '@/lib/encombrants';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET ?city=Lyon — règle de collecte connue pour la ville + prochaine date (ou null).
export async function GET(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const city = req.nextUrl.searchParams.get('city') || '';
  const s = getSchedule(city);
  return NextResponse.json({
    ok: true,
    schedule: s ? { freq: s.freq, weekday: s.weekday, week: s.week, city_label: s.city_label } : null,
    next: s ? nextCollectionDate({ freq: s.freq, weekday: s.weekday, week: s.week }) : null,
  });
}

// POST — programmer (ou corriger) le calendrier encombrants d'une ville.
export async function POST(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  let b: { city?: string; freq?: 'weekly' | 'monthly'; weekday?: number; week?: string } = {};
  try { b = await req.json(); } catch { return NextResponse.json({ error: 'bad_body' }, { status: 400 }); }
  if (!b.city || !b.city.trim()) return NextResponse.json({ error: 'city_required' }, { status: 400 });
  if (b.weekday == null) return NextResponse.json({ error: 'weekday_required' }, { status: 400 });
  const s = setSchedule(b.city, { freq: b.freq === 'weekly' ? 'weekly' : 'monthly', weekday: b.weekday, week: b.week || 'last' }, me.id);
  return NextResponse.json({
    ok: true,
    schedule: s ? { freq: s.freq, weekday: s.weekday, week: s.week, city_label: s.city_label } : null,
    next: s ? nextCollectionDate({ freq: s.freq, weekday: s.weekday, week: s.week }) : null,
  });
}
