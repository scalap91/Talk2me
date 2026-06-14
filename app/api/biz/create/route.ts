import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { createBusinessInbox, listBusinessInboxes } from '@/lib/biz-inbox';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Authentifié (vérif interne) — crée une messagerie entreprise pour le user.
export async function POST(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  let body: { name?: string; description?: string; category?: string } = {};
  try { body = await req.json(); } catch { /* defaults */ }
  const inbox = createBusinessInbox(me.id, body.name || 'Ma messagerie', body.description, body.category);
  return NextResponse.json({ ok: true, inbox });
}

// Liste des messageries du user.
export async function GET(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  return NextResponse.json({ ok: true, inboxes: listBusinessInboxes(me.id) });
}
