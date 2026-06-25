/**
 * POST /api/contacts/match { contacts: [{ n?: name, p: phone }] }
 * Reçoit le répertoire du tél, normalise les numéros, et dit lesquels sont DÉJÀ sur
 * Talk2Me (avec infos publiques) vs à INVITER. Auth requise. PII : on ne renvoie que
 * pseudo/nom/avatar des membres ; les non-membres restent juste un numéro local.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { getUserByPhone } from '@/lib/db';
import { normalizePhone } from '@/lib/phone';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const raw = Array.isArray(body.contacts) ? body.contacts : [];
  const seen = new Set<string>();
  const onT2m: Array<{ id: string; username: string; display_name: string | null; avatar_url: string | null; name: string | null }> = [];
  const toInvite: Array<{ name: string | null; phone: string }> = [];

  for (const c of raw.slice(0, 2000)) {
    const item = c as { n?: unknown; p?: unknown };
    const phone = normalizePhone(typeof item.p === 'string' ? item.p : '');
    if (!phone || seen.has(phone)) continue;
    seen.add(phone);
    const name = typeof item.n === 'string' ? item.n.slice(0, 80) : null;
    const u = getUserByPhone(phone);
    if (u && u.id !== me.id) {
      onT2m.push({ id: u.id, username: u.username, display_name: u.display_name, avatar_url: u.avatar_url, name });
    } else if (!u) {
      toInvite.push({ name, phone });
    }
  }
  // tri : à inviter par nom (plus lisible)
  toInvite.sort((a, b) => (a.name || a.phone).localeCompare(b.name || b.phone));
  return NextResponse.json({ ok: true, on_t2m: onT2m, to_invite: toInvite });
}
