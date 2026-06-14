import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { hasPermission } from '@/lib/permissions';
import { listPending, remindStale } from '@/lib/curation-queue';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// VALIDATEUR/ADMIN : la file à valider (+ rappel paresseux des fiches qui stagnent).
export async function GET(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me || !hasPermission(me.id, me.email, 'curation_validateur')) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  try { remindStale(); } catch { /* */ }
  return NextResponse.json({ ok: true, pending: listPending() });
}
