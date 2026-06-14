import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { deleteAccounts, type Provider } from '@/lib/connected-accounts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  let b: { provider?: string } = {};
  try { b = await req.json(); } catch { /* */ }
  const n = deleteAccounts(me.id, (b.provider as Provider) || undefined);
  return NextResponse.json({ ok: true, removed: n });
}
