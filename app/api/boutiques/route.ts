/**
 * Talk2Me #428 — Boutiques.
 * GET  /api/boutiques        → mes boutiques (pour le picker de l'éditeur)
 * POST /api/boutiques        → crée une boutique { name, description?, cover_url? }
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { createBoutique, getUserBoutiques } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  return NextResponse.json({ ok: true, boutiques: getUserBoutiques(me.id) });
}

export async function POST(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  let body: { name?: unknown; description?: unknown; cover_url?: unknown; cover_position?: unknown; kind?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) return NextResponse.json({ error: 'name_required' }, { status: 400 });
  const description = typeof body.description === 'string' ? body.description : null;
  const cover_url =
    typeof body.cover_url === 'string' && body.cover_url.startsWith('/uploads/')
      ? body.cover_url
      : null;
  const cover_position =
    typeof body.cover_position === 'string' && /^\d{1,3}% \d{1,3}%$/.test(body.cover_position.trim())
      ? body.cover_position.trim()
      : null;
  const kind = body.kind === 'dropship' ? 'dropship' : 'stock';
  const boutique = createBoutique(me.id, { name, description, cover_url, cover_position, kind }, Date.now());
  return NextResponse.json({ ok: true, boutique });
}
