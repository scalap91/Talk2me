/**
 * Cron quotidien — REVERSEMENT auto des locations (Pascal 2026-06-26).
 * Libère (décaisse) les jours échus vers le propriétaire, jour par jour.
 * Protégé par header x-cron-secret (= env CRON_SECRET). Appelé par un cron externe.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { releaseDueSettlements } from '@/lib/rental-planning';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get('x-cron-secret') !== secret) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const r = await releaseDueSettlements();
  return NextResponse.json({ ok: true, ...r });
}

export const GET = POST;
