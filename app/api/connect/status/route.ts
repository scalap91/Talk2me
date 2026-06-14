import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { listConnected } from '@/lib/connected-accounts';
import { meta, google } from '@/lib/social/oauth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  return NextResponse.json({
    ok: true,
    accounts: listConnected(me.id),
    available: { meta: meta.configured, google: google.configured },
  });
}
