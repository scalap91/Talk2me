/**
 * Talk2Me — Token FCM (appli native APK, Pascal 2026-06-11).
 * POST   { token, platform? } → enregistre le token de l'appareil (auth requise).
 * DELETE { token } → le supprime.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { saveFcmToken, removeFcmToken } from '@/lib/push';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const b = await req.json().catch(() => null);
  if (!b?.token || typeof b.token !== 'string') return NextResponse.json({ error: 'token_required' }, { status: 400 });
  saveFcmToken(me.id, b.token, typeof b.platform === 'string' ? b.platform : 'android');
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const b = await req.json().catch(() => null);
  if (b?.token) removeFcmToken(String(b.token));
  return NextResponse.json({ ok: true });
}
