/**
 * GET /api/drive/my-rentals — mes véhicules en LOCATION (propriétaire) pour gérer leur
 * planning dans Drive. Pascal 2026-06-26 (Phase 1).
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { listMyRentals } from '@/lib/rental-planning';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  return NextResponse.json({ ok: true, vehicles: listMyRentals(me.id) });
}
