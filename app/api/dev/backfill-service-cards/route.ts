/**
 * /api/dev/backfill-service-cards — écrit le fichier `.card` de TOUS les services + emplois
 * existants (migration Card OS, Pascal 2026-07-11 « tout est card »). Idempotent.
 */
import { NextResponse } from 'next/server';
import { backfillServiceEmploiCards } from '@/lib/simple-shop';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  const written = await backfillServiceEmploiCards();
  return NextResponse.json({ ok: true, written });
}
