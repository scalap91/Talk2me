/**
 * POST /api/compute/result (Pascal 2026-07-04)
 * Un téléphone du pool RENVOIE le résultat d'une tâche (le texte OCR de la figure).
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { submitResult } from '@/lib/compute/task-queue';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  let taskId = '', text = '', deviceId = me.id;
  let via: 'native' | 'web' | undefined;
  try { const b = await req.json(); taskId = String(b?.taskId || ''); text = String(b?.text || ''); deviceId = String(b?.device_id || me.id); via = b?.via === 'native' ? 'native' : b?.via === 'web' ? 'web' : undefined; }
  catch { return NextResponse.json({ error: 'bad_json' }, { status: 400 }); }
  if (!taskId) return NextResponse.json({ error: 'no_task' }, { status: 400 });
  console.log(`[COMPUTE-RESULT] via=${via || '?'} device=${deviceId} user=${me.id} task=${taskId} textLen=${(text || '').length} snippet=${JSON.stringify((text || '').slice(0, 220))}`);
  const ok = submitResult(taskId, deviceId, text, via);
  return NextResponse.json({ ok });
}
