import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { listMine } from '@/lib/curation-queue';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// REGARDEUR : mes propositions + leur statut (confirmation).
export async function GET(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  return NextResponse.json({ ok: true, submissions: listMine(me.id) });
}
