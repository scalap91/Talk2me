/**
 * Talk2Me — Classement des contributeurs du mois (motivation / challenge).
 * GET /api/network/leaderboard → top du mois (id, points, commissions, rang).
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { getLeaderboard } from '@/lib/network';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  return NextResponse.json({ ok: true, top: getLeaderboard(20) });
}
