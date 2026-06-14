/**
 * POST /api/users/me/room-photo { room_photo: string|null, room_tagline?: string }
 * Talk2Me Pièce 3D (Pascal 2026-06-14) — l'user choisit la PHOTO de sa salle 3D
 * (carte d'invitation du feed + déco de la pièce) + un petit mot d'accroche.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { updateRoomPhoto } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const me = getCurrentUserFromRequest(request);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  let body: { room_photo?: unknown; room_tagline?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'invalid_body' }, { status: 400 }); }
  const photo = typeof body.room_photo === 'string' && body.room_photo ? body.room_photo : null;
  const tagline = typeof body.room_tagline === 'string' ? body.room_tagline.slice(0, 80) : undefined;
  try {
    updateRoomPhoto(me.id, photo, tagline);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message || 'fail' }, { status: 400 });
  }
  return NextResponse.json({ ok: true, room_photo: photo, room_tagline: tagline ?? null });
}
