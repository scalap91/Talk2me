import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { getBusinessInbox, listInboxThreads, updateBusinessInbox } from '@/lib/biz-inbox';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/biz/manage?id=<inboxId> — détail messagerie + fils clients (owner only).
export async function GET(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const id = new URL(req.url).searchParams.get('id') || '';
  const inbox = getBusinessInbox(id);
  if (!inbox || inbox.owner_id !== me.id) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.json({
    ok: true,
    inbox: {
      id: inbox.id, name: inbox.name, public_key: inbox.public_key,
      greeting: inbox.greeting, accent: inbox.accent,
      bot_enabled: !!inbox.bot_enabled, knowledge: inbox.knowledge || '',
    },
    threads: listInboxThreads(inbox.id),
  });
}

// POST /api/biz/manage — maj config (chatbot / base doc / accueil / nom). owner only.
export async function POST(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  let body: { id?: string; bot_enabled?: boolean; knowledge?: string; greeting?: string; name?: string } = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid_body' }, { status: 400 }); }
  if (!body.id) return NextResponse.json({ error: 'id_required' }, { status: 400 });
  const updated = updateBusinessInbox(body.id, me.id, {
    ...(body.bot_enabled !== undefined ? { bot_enabled: body.bot_enabled ? 1 : 0 } : {}),
    ...(body.knowledge !== undefined ? { knowledge: body.knowledge } : {}),
    ...(body.greeting !== undefined ? { greeting: body.greeting } : {}),
    ...(body.name !== undefined ? { name: body.name } : {}),
  });
  if (!updated) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
