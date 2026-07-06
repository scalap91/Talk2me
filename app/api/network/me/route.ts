/**
 * Talk2Me — Mon activité contributeur (Pascal 2026-06-20).
 * GET  /api/network/me  → { is_contributor, stats } (null si pas encore contributeur)
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { getContributorStats } from '@/lib/network';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const stats = getContributorStats(me.id);
  return NextResponse.json({ ok: true, is_contributor: !!stats, stats, my_ref: me.id });
}
