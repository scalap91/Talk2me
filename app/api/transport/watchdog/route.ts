/**
 * Talk2Me — Watchdog acheminement (Brique C). Scanne les tronçons en route et aboie
 * (notif "vous semblez à l'arrêt ?") sur ceux immobiles / ETA dépassée.
 * À appeler par un cron externe (header x-watchdog-secret) OU par un super-admin.
 * Marche aussi en "paresseux" à chaque ouverture du suivi (getTrace) — donc résilient sans cron.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { isAiOpsAdmin } from '@/lib/ai-ops/auth';
import { checkAllStalls } from '@/lib/shipment';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const secret = process.env.TRANSPORT_WATCHDOG_SECRET;
  const hdr = req.headers.get('x-watchdog-secret');
  let ok = !!(secret && hdr && hdr === secret);
  if (!ok) { const me = getCurrentUserFromRequest(req); ok = !!(me && isAiOpsAdmin(me.id, me.email)); }
  if (!ok) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  return NextResponse.json({ ok: true, flagged: checkAllStalls() });
}
