/**
 * Talk2Me — ADMIN : donner des droits à des collaborateurs (super-admin only).
 * GET  → droits disponibles + collaborateurs actuels.
 * POST { handle, permission, grant } → accorde/révoque (handle = @username ou ID6).
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { isAiOpsAdmin } from '@/lib/ai-ops/auth';
import { getDb, getUserById } from '@/lib/db';
import { PERMISSIONS, listCollaborators, setPermission } from '@/lib/permissions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function findUser(handle: string): { id: string; username: string; display_name: string | null } | null {
  const h = handle.trim().replace(/^@/, '');
  if (!h) return null;
  const row = getDb().prepare(
    'SELECT id, username, display_name FROM users WHERE username = ? OR talk2me_id = ? LIMIT 1'
  ).get(h, h) as { id: string; username: string; display_name: string | null } | undefined;
  return row || null;
}

export async function GET(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me || !isAiOpsAdmin(me.id, me.email)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const collabs = listCollaborators().map((c) => {
    const u = getUserById(c.user_id);
    return { user_id: c.user_id, username: u?.username || '?', display_name: u?.display_name || null, permissions: c.permissions };
  });
  return NextResponse.json({ ok: true, available: PERMISSIONS, collaborators: collabs });
}

export async function POST(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me || !isAiOpsAdmin(me.id, me.email)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  let b: { handle?: string; permission?: string; grant?: boolean } = {};
  try { b = await req.json(); } catch { return NextResponse.json({ error: 'bad_body' }, { status: 400 }); }
  const u = findUser(b.handle || '');
  if (!u) return NextResponse.json({ error: 'user_not_found' }, { status: 404 });
  if (!setPermission(u.id, b.permission || '', b.grant !== false, me.id)) return NextResponse.json({ error: 'bad_permission' }, { status: 400 });
  return NextResponse.json({ ok: true, user: { id: u.id, username: u.username }, permission: b.permission, granted: b.grant !== false });
}
