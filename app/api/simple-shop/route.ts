import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { createSimpleShop, listSimpleShops } from '@/lib/simple-shop';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST { name } → crée une petite boutique (perso, photos+prix). GET → liste.
export async function POST(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  let body: { name?: string; description?: string; category?: string; kind?: 'boutique' | 'eat'; coverUrl?: string; lat?: number; lng?: number; prepMin?: number } = {};
  try { body = await req.json(); } catch { /* defaults */ }
  const kind = body.kind === 'eat' ? 'eat' : 'boutique';
  const shop = createSimpleShop(
    me.id,
    body.name || (kind === 'eat' ? 'Mon resto' : 'Ma boutique'),
    body.description,
    body.category,
    kind,
    {
      coverUrl: body.coverUrl || null,
      lat: typeof body.lat === 'number' ? body.lat : null,
      lng: typeof body.lng === 'number' ? body.lng : null,
      prepMin: typeof body.prepMin === 'number' ? body.prepMin : null,
    }
  );
  return NextResponse.json({ ok: true, shop });
}

export async function GET(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  return NextResponse.json({ ok: true, shops: listSimpleShops(me.id) });
}
