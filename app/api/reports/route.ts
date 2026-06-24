/**
 * /api/reports — Signaler un utilisateur OU un contenu (Apple Guideline 1.2).
 * Body :
 *   { target:'user', user_id, reason, description? }
 *   { target:'content', content_kind:'direct_card'|'post'|'message', content_id, reason, description? }
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { reportUser, reportContent, REPORT_REASONS, type ReportReason, type ContentKind } from '@/lib/moderation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const reason = (REPORT_REASONS.includes(body.reason as ReportReason) ? body.reason : 'autre') as ReportReason;
  const description = typeof body.description === 'string' ? body.description : '';

  if (body.target === 'user' && typeof body.user_id === 'string') {
    const ok = reportUser(me.id, body.user_id, reason, description);
    return NextResponse.json(ok ? { ok: true } : { error: 'invalid' }, { status: ok ? 200 : 400 });
  }
  if (body.target === 'content' && typeof body.content_id === 'string' && typeof body.content_kind === 'string') {
    const ok = reportContent(me.id, body.content_kind as ContentKind, body.content_id, reason, description);
    return NextResponse.json(ok ? { ok: true } : { error: 'invalid' }, { status: ok ? 200 : 400 });
  }
  return NextResponse.json({ error: 'bad_request' }, { status: 400 });
}
