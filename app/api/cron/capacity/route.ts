/**
 * Cron GARDE-FOU CAPACITÉ (Pascal 2026-07-09). Protégé par x-cron-secret (= CRON_SECRET).
 * À appeler périodiquement (ex. 1×/h). Compte inscrits + actifs, aboie sur Telegram si on
 * approche du mur (seuils réglables admin, app_settings capacity.*). GET pour lecture rapide.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCapacityStats, checkCapacity } from '@/lib/capacity-watchdog';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get('x-cron-secret') !== secret) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const r = checkCapacity(today());
  return NextResponse.json({ ok: true, ...r });
}

// Lecture seule (dashboard/admin) — pas d'alerte.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get('x-cron-secret') !== secret) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  return NextResponse.json({ ok: true, ...getCapacityStats() });
}
