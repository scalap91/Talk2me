/** POST /api/users/me/name { display_name } — renomme le nom affiché. */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { updateDisplayName } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const me = getCurrentUserFromRequest(request);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { display_name?: unknown };
  const name = typeof body.display_name === 'string' ? body.display_name.trim() : '';
  if (!name) return NextResponse.json({ error: 'name_required' }, { status: 400 });
  try {
    updateDisplayName(me.id, name);
    return NextResponse.json({ ok: true, display_name: name });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'failed' }, { status: 400 });
  }
}
