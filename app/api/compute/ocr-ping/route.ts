/**
 * POST /api/compute/ocr-ping (Pascal 2026-07-13)
 * Le scan karaoké OCR l'écran EN LOCAL (hors file de tâches) → il « ping » ici à chaque OCR pour
 * que le travail GPU soit compté dans le tableau de bord du mesh (« GPU natif »). { via }.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { recordOnDeviceOcr } from '@/lib/compute/task-queue';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const b = await req.json().catch(() => null);
  recordOnDeviceOcr(b?.via === 'native' ? 'native' : b?.via === 'web' ? 'web' : undefined);
  return NextResponse.json({ ok: true });
}
