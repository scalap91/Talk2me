/**
 * Talk2Me — Test push (Pascal 2026-06-11). POST → s'envoie une notif de test
 * (vérifie l'abonnement de l'appareil de bout en bout).
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { sendPushToUser } from '@/lib/push';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const sent = await sendPushToUser(me.id, {
    title: 'Talk2Me',
    body: '🔔 Tes notifications sont activées !',
    url: '/home',
    tag: 'test',
  });
  return NextResponse.json({ ok: true, sent });
}
