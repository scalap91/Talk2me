/**
 * Photos perso du profil (Pascal 2026-08-30).
 *  GET    → mes photos.
 *  POST   { url, caption? } → ajoute une photo (url issue de /api/upload) à MON profil.
 *  DELETE { id } → retire une de MES photos.
 * Le rendu public passe par getProfileDiscovery (SSR) ; cette route ne sert qu'à MOI (gestion).
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { listUserPhotos, addUserPhoto, deleteUserPhoto } from '@/lib/user-photos';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  return NextResponse.json({ ok: true, photos: listUserPhotos(me.id) });
}

export async function POST(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  let body: { url?: unknown; caption?: unknown } = {};
  try { body = await req.json(); } catch { /* */ }
  const url = typeof body.url === 'string' && body.url.startsWith('/uploads/') ? body.url : null;
  if (!url) return NextResponse.json({ error: 'url_required' }, { status: 400 });
  const caption = typeof body.caption === 'string' ? body.caption : null;
  return NextResponse.json({ ok: true, photo: addUserPhoto(me.id, url, caption) });
}

export async function DELETE(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  let body: { id?: unknown } = {};
  try { body = await req.json(); } catch { /* */ }
  const id = typeof body.id === 'string' ? body.id : '';
  if (!id) return NextResponse.json({ error: 'id_required' }, { status: 400 });
  return NextResponse.json({ ok: deleteUserPhoto(id, me.id) });
}
