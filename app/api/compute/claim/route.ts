/**
 * POST /api/compute/claim (Pascal 2026-07-04)
 * Un téléphone du pool PREND une tâche de calcul à traiter (OCR d'une figure sur son GPU).
 * Renvoie { task: { id, type, imageUrl } } ou { task: null } s'il n'y a rien.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { claimTask } from '@/lib/compute/task-queue';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  let deviceId = '';
  try { const b = await req.json(); deviceId = String(b?.device_id || me.id); } catch { deviceId = me.id; }
  const task = claimTask(deviceId);
  return NextResponse.json({ ok: true, task });
}
