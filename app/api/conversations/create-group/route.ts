/**
 * POST /api/conversations/create-group { name, member_ids?: string[], members?: string[] }
 * Crée une conversation de GROUPE (T2M social). Membres = amis acceptés.
 * `members` accepte aussi talk2me_id/@pseudo (résolus). Le créateur est inclus.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import {
  createGroupConversation,
  getUserById,
  getUserByTalk2MeId,
  getUserByUsername,
  isFriend,
} from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const me = getCurrentUserFromRequest(request);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let body: { name?: unknown; member_ids?: unknown; members?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }
  const name = typeof body.name === 'string' ? body.name : '';

  // Résout les membres : par id direct, sinon par talk2me_id/@pseudo.
  const resolved = new Set<string>();
  const fromIds = Array.isArray(body.member_ids) ? (body.member_ids as unknown[]) : [];
  for (const x of fromIds) {
    if (typeof x === 'string' && getUserById(x)) resolved.add(x);
  }
  const fromHandles = Array.isArray(body.members) ? (body.members as unknown[]) : [];
  for (const x of fromHandles) {
    if (typeof x !== 'string' || !x.trim()) continue;
    const q = x.trim().replace(/^@/, '');
    const u = getUserById(q) || getUserByTalk2MeId(q) || getUserByUsername(q);
    if (u) resolved.add(u.id);
  }
  resolved.delete(me.id);

  // T2M social : on ne met dans un groupe que des amis acceptés (anti-spam).
  const members = [...resolved].filter((mid) => isFriend(me.id, mid));
  if (members.length < 1) {
    return NextResponse.json({ error: 'need_at_least_one_friend' }, { status: 400 });
  }

  try {
    const conv = createGroupConversation(me.id, name, members);
    return NextResponse.json({ ok: true, conversation: conv });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'create_failed' }, { status: 400 });
  }
}
