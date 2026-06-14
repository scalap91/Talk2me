import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { setCourseProgress, completeCourse, confirmHandoff } from '@/lib/transport';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST — avancer le suivi d'une course.
//   { request_id, progress }      → transporteur avance une étape
//   { request_id, token: 'ABC123' } → client confirme la remise avec le CODE (NFC/Talk) → libère l'escrow
//   { request_id, confirm: true }  → client confirme sans code (fallback)
export async function POST(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  let b: { request_id?: string; progress?: string; confirm?: boolean; token?: string } = {};
  try { b = await req.json(); } catch { return NextResponse.json({ error: 'bad_body' }, { status: 400 }); }
  if (!b.request_id) return NextResponse.json({ error: 'request_id_required' }, { status: 400 });

  const r = b.token != null
    ? confirmHandoff(b.request_id, me.id, b.token)
    : b.confirm
    ? completeCourse(b.request_id, me.id)
    : setCourseProgress(b.request_id, me.id, b.progress || '');
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
  return NextResponse.json({ ok: true, request: r.request });
}
