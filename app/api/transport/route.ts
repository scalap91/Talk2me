import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { createTransportRequest, listOpenTransportRequests, listMyCourses } from '@/lib/transport';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST — créer une demande de transport. GET — demandes ouvertes (transporteurs).
export async function POST(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  let b: { kind?: 'move' | 'parcel' | 'encombrants'; title?: string; photo_url?: string; from_text?: string; to_text?: string; when_text?: string; from_lat?: number; from_lng?: number; budget_cents?: number } = {};
  try { b = await req.json(); } catch { return NextResponse.json({ error: 'bad_body' }, { status: 400 }); }
  if (!b.title || !b.title.trim()) return NextResponse.json({ error: 'title_required' }, { status: 400 });
  const r = createTransportRequest(me.id, {
    kind: b.kind === 'parcel' || b.kind === 'encombrants' ? b.kind : 'move',
    title: b.title, photo_url: b.photo_url, from_text: b.from_text, to_text: b.to_text,
    when_text: b.when_text, from_lat: b.from_lat ?? null, from_lng: b.from_lng ?? null, budget_cents: b.budget_cents ?? null,
  });
  return NextResponse.json({ ok: true, request: r });
}

export async function GET(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  // Code de remise : visible UNIQUEMENT par le transporteur (il le donne au client).
  const courses = listMyCourses(me.id).map((c) =>
    c.transporter_id === me.id ? c : { ...c, handoff_token: null });
  return NextResponse.json({ ok: true, me: me.id, requests: listOpenTransportRequests(), courses });
}
