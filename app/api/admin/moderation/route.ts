/**
 * Talk2Me — API admin MODÉRATION (Pascal 2026-06-24, Apple 1.2 "agir <24h").
 * GET  → signalements en attente (users + contenu) + compteurs.
 * POST → { table:'user'|'content', report_id, status:'resolved'|'dismissed', action_taken? }
 *        clôt un signalement. Admin only. Moteur : lib/moderation.ts.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { isAiOpsAdmin } from '@/lib/ai-ops/auth';
import { listPendingReports, countPendingReports, resolveReport } from '@/lib/moderation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function guard(req: NextRequest) {
  const user = getCurrentUserFromRequest(req);
  if (!user) return { error: NextResponse.json({ error: 'unauthorized' }, { status: 401 }) };
  if (!isAiOpsAdmin(user.id, (user as { email?: string }).email))
    return { error: NextResponse.json({ error: 'forbidden' }, { status: 403 }) };
  return { user };
}

export async function GET(req: NextRequest) {
  const g = guard(req);
  if (g.error) return g.error;
  const reports = listPendingReports(200);
  return NextResponse.json({ ok: true, ...reports, counts: countPendingReports() });
}

export async function POST(req: NextRequest) {
  const g = guard(req);
  if (g.error) return g.error;
  let body: { table?: string; report_id?: string; status?: string; action_taken?: string } = {};
  try { body = await req.json(); } catch { /* */ }
  const table = body.table === 'content' ? 'content' : body.table === 'user' ? 'user' : null;
  const status = body.status === 'dismissed' ? 'dismissed' : body.status === 'resolved' ? 'resolved' : null;
  if (!table || !status || !body.report_id) return NextResponse.json({ error: 'missing_fields' }, { status: 400 });
  const ok = resolveReport(table, body.report_id, g.user!.id, status, body.action_taken || '');
  return NextResponse.json(ok ? { ok: true } : { error: 'not_found' }, { status: ok ? 200 : 404 });
}
