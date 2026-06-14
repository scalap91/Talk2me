import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { getCourseConversationId } from '@/lib/transport';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST { request_id } — get-or-create la conversation de course (Talk Phone/SMS),
// puis le client route vers /c/{conversation_id}?call=audio (stack appel éprouvé).
export async function POST(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  let b: { request_id?: string } = {};
  try { b = await req.json(); } catch { return NextResponse.json({ error: 'bad_body' }, { status: 400 }); }
  if (!b.request_id) return NextResponse.json({ error: 'request_id_required' }, { status: 400 });
  const r = getCourseConversationId(b.request_id, me.id);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.error === 'forbidden' ? 403 : 400 });
  return NextResponse.json({ ok: true, conversation_id: r.conversation_id });
}
