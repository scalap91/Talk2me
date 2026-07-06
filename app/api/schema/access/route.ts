/**
 * /api/schema/access — gestion des rôles cockpit (SUPER-ADMIN only, DEV ONLY).
 * GET            → liste des accès (enrichis du username) + rôles assignables.
 * POST grant     → { username, role }  : assigne un rôle cockpit à un user.
 * POST revoke    → { userId }           : retire l'accès cockpit d'un user.
 * Gardes : dev-only (comme la boussole) + isAiOpsAdmin (super-admin réel).
 * Ne renvoie jamais d'email/PII : seulement username + rôle.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { isAiOpsAdmin } from '@/lib/ai-ops/auth';
import { getUserByUsername, getUserById } from '@/lib/db';
import { ROLES } from '@/lib/schema/registry';
import { listCockpitAccess, setCockpitRole, revokeCockpitRole } from '@/lib/schema/access';
import { isDevDiag } from '@/lib/schema/diag';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function guard(req: NextRequest) {
  if (!isDevDiag()) return { err: new NextResponse('Not found', { status: 404 }) };
  const me = getCurrentUserFromRequest(req);
  if (!me) return { err: NextResponse.json({ error: 'auth_required' }, { status: 401 }) };
  if (!isAiOpsAdmin(me.id, me.email)) return { err: NextResponse.json({ error: 'forbidden' }, { status: 403 }) };
  return { me };
}

export async function GET(req: NextRequest) {
  const g = guard(req);
  if (g.err) return g.err;
  const grants = listCockpitAccess().map((a) => {
    const u = getUserById(a.user_id);
    return { user_id: a.user_id, username: u?.username || '(inconnu)', role: a.role, created_at: a.created_at };
  });
  return NextResponse.json({
    grants,
    roles: ROLES.map((r) => ({ key: r.key, name: r.name, emoji: r.emoji })),
  });
}

export async function POST(req: NextRequest) {
  const g = guard(req);
  if (g.err) return g.err;
  const body = await req.json().catch(() => ({}));
  const action = body.action;

  if (action === 'grant') {
    const username = String(body.username || '').trim().replace(/^@/, '');
    const role = String(body.role || '');
    if (!username || !role) return NextResponse.json({ error: 'username_and_role_required' }, { status: 400 });
    const target = getUserByUsername(username);
    if (!target) return NextResponse.json({ error: 'user_not_found' }, { status: 404 });
    const ok = setCockpitRole(target.id, role, g.me!.id);
    if (!ok) return NextResponse.json({ error: 'invalid_role' }, { status: 400 });
    return NextResponse.json({ ok: true, username: target.username, role });
  }

  if (action === 'revoke') {
    const userId = String(body.userId || '');
    if (!userId) return NextResponse.json({ error: 'userId_required' }, { status: 400 });
    const ok = revokeCockpitRole(userId);
    return NextResponse.json({ ok });
  }

  return NextResponse.json({ error: 'unknown_action' }, { status: 400 });
}
