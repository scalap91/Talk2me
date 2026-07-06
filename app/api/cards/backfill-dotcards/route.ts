/**
 * POST (ou GET) /api/cards/backfill-dotcards — UPGRADE Card OS (Pascal 2026-06-30).
 * Convertit TOUS les anciens posts en `.card` (remplit la colonne dotcard). Idempotent.
 * Super-admin only. À taper UNE fois ; relançable sans risque (ne touche que dotcard IS NULL).
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { isAiOpsAdmin } from '@/lib/ai-ops/auth';
import { backfillDotcards } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function run(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me || !isAiOpsAdmin(me.id, me.email)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  let total = 0;
  let remaining = 0;
  // jusqu'à 50 lots de 500 = 25 000 cards max par appel (rappeler si > 25k restant).
  for (let i = 0; i < 50; i++) {
    const r = backfillDotcards(500);
    total += r.converted;
    remaining = r.remaining;
    if (r.converted === 0) break;
  }
  return NextResponse.json({ ok: true, converted: total, remaining });
}

export async function POST(req: NextRequest) { return run(req); }
export async function GET(req: NextRequest) { return run(req); }
