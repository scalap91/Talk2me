/**
 * Talk2Me — Web Push (Pascal 2026-06-11).
 * GET    → { publicKey } (clé VAPID publique pour s'abonner).
 * POST   { subscription } → enregistre l'abonnement de l'appareil (auth requise).
 * DELETE { endpoint } → supprime l'abonnement.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { getVapidPublicKey, saveSubscription, removeSubscription } from '@/lib/push';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ ok: true, publicKey: getVapidPublicKey() });
}

export async function POST(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const b = await req.json().catch(() => null);
  const sub = b?.subscription;
  if (!sub?.endpoint || !sub?.keys) return NextResponse.json({ error: 'invalid_subscription' }, { status: 400 });
  const ok = saveSubscription(me.id, sub);
  return NextResponse.json({ ok });
}

export async function DELETE(req: NextRequest) {
  const b = await req.json().catch(() => null);
  if (b?.endpoint) removeSubscription(String(b.endpoint));
  return NextResponse.json({ ok: true });
}
