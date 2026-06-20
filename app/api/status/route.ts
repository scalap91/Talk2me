import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest, } from '@/lib/auth';
import { listFriends } from '@/lib/db';
import { createStatus, getStatusFeed, deleteStatus } from '@/lib/status';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST { kind, media_url?, shop_id?, caption? } — ajoute un statut (à ma story).
export async function POST(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  let body: { kind?: 'image' | 'video' | 'shop'; media_url?: string; shop_id?: string; caption?: string } = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid_body' }, { status: 400 }); }
  const kind = body.kind || (body.shop_id ? 'shop' : 'image');
  if (kind !== 'shop' && !body.media_url) return NextResponse.json({ error: 'media_required' }, { status: 400 });
  if (kind === 'shop' && !body.shop_id) return NextResponse.json({ error: 'shop_required' }, { status: 400 });
  const status = createStatus(me.id, { kind, media_url: body.media_url, shop_id: body.shop_id, caption: body.caption });
  return NextResponse.json({ ok: true, status });
}

// GET — rangée de statuts (moi + mes contacts), groupés par propriétaire.
export async function GET(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const friendIds = listFriends(me.id).map((u) => u.id);
  // Géoloc du viewer (optionnelle) → stories boutique/plat visibles dans 500 m.
  const sp = req.nextUrl.searchParams;
  const lat = parseFloat(sp.get('lat') || ''); const lng = parseFloat(sp.get('lng') || '');
  const viewer = Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : undefined;
  return NextResponse.json({ ok: true, groups: getStatusFeed(me.id, friendIds, viewer), me: { id: me.id, avatar_url: me.avatar_url ?? null, display_name: me.display_name ?? null } });
}

// DELETE { id } — supprime un de MES statuts (je ne veux plus de cette story).
export async function DELETE(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  let body: { id?: string } = {};
  try { body = await req.json(); } catch { /* */ }
  if (body.id) deleteStatus(me.id, body.id);
  return NextResponse.json({ ok: true });
}
