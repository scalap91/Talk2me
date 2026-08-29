/**
 * GET /api/admin/sanctions — FILE STAFF des sanctions actives NON LEVÉES (Pascal 2026-08-29,
 * Branchement 3 : « toute sanction non levée remonte au staff »). Supervision finale, STAFF-ONLY.
 * Chaque entrée indique si un RECOURS est en cours (le staff voit ce qui est contesté vs figé).
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { isAiOpsAdmin } from '@/lib/ai-ops/auth';
import { listActiveSanctions, liftSanction } from '@/lib/sanctions';
import { findOpenAppeal } from '@/lib/litige';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!isAiOpsAdmin(me.id, me.email)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const rows = listActiveSanctions().map((s) => {
    const appeal = findOpenAppeal(s.id);
    return {
      id: s.id,
      user: { id: s.user_id, username: s.username, display_name: s.display_name, avatar_url: s.avatar_url },
      level: s.level,
      reason: s.reason,
      by_user: s.by_user,
      created_at: s.created_at,
      expires_at: s.expires_at,
      appeal: appeal ? { id: appeal.id, status: appeal.status } : null,
    };
  });
  return NextResponse.json({ ok: true, count: rows.length, sanctions: rows });
}

// POST { action:'lift', sanction_id } — le STAFF lève une sanction en dernier ressort (override).
export async function POST(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!isAiOpsAdmin(me.id, me.email)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const b = await req.json().catch(() => ({} as Record<string, unknown>));
  if (b.action !== 'lift' || typeof b.sanction_id !== 'string') return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  const r = liftSanction(b.sanction_id, me.id);
  return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.error }, { status: 400 });
}
