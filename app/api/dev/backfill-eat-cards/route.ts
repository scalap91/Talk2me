/**
 * /api/dev/backfill-eat-cards — écrit le fichier `.card` de TOUTES les fiches Eat existantes
 * (migration Card OS, Pascal 2026-07-11 « tout est card »). Idempotent, best-effort.
 */
import { NextResponse } from 'next/server';
import { backfillEatCards } from '@/lib/eat-listings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  const written = await backfillEatCards();
  return NextResponse.json({ ok: true, written });
}
