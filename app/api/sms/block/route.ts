/** SMS Talk — blocage COUCHE COMM (indépendant de T2M social). POST {with, blocked}. */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { setCommBlock, getUserById } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { with?: string; blocked?: boolean };
  const otherId = typeof body.with === 'string' ? body.with : '';
  if (!otherId || !getUserById(otherId)) return NextResponse.json({ error: 'no_peer' }, { status: 400 });
  setCommBlock(me.id, otherId, !!body.blocked);
  return NextResponse.json({ ok: true });
}
