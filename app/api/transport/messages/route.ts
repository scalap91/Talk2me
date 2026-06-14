import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { getCoursePartyRequest, addCourseMessage, listCourseMessages } from '@/lib/transport';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Fil de course (livreur ↔ client). Accès réservé aux 2 parties de la course.
export async function GET(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const requestId = req.nextUrl.searchParams.get('request_id') || '';
  if (!requestId) return NextResponse.json({ error: 'request_id_required' }, { status: 400 });
  if (!getCoursePartyRequest(requestId, me.id)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  return NextResponse.json({ ok: true, me: me.id, messages: listCourseMessages(requestId) });
}

export async function POST(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  let b: { request_id?: string; body?: string } = {};
  try { b = await req.json(); } catch { return NextResponse.json({ error: 'bad_body' }, { status: 400 }); }
  if (!b.request_id) return NextResponse.json({ error: 'request_id_required' }, { status: 400 });
  const r = addCourseMessage(b.request_id, me.id, b.body || '');
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.error === 'forbidden' ? 403 : 400 });
  return NextResponse.json({ ok: true, message: r.message });
}
