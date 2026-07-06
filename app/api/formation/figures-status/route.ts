/**
 * GET /api/formation/figures-status?batch=... (Pascal 2026-07-04)
 * Le producteur suit un batch de figures : combien de tâches OCR le POOL de téléphones a
 * traitées, et récupère les textes. Le desktop qui a envoyé n'a rien calculé.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { batchStatus } from '@/lib/compute/task-queue';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const batch = req.nextUrl.searchParams.get('batch') || '';
  if (!batch) return NextResponse.json({ error: 'no_batch' }, { status: 400 });
  const st = batchStatus(batch);
  return NextResponse.json({ ok: true, ...st });
}
