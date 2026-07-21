/**
 * GET /api/plat-maison/mine — mes plats maison (composer). Chaque fiche RESTE ici même expirée
 * (Pascal 2026-07-19 : « la fiche reste dans le composer mais elle doit la réactiver chaque jour »).
 * → { ok, plats: [{ id, name, public_key, cover_url, items_count, online_count }] }.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { listMyPlatMaison } from '@/lib/simple-shop';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  return NextResponse.json({ ok: true, plats: listMyPlatMaison(me.id) });
}
