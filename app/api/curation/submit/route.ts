import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { hasPermission } from '@/lib/permissions';
import { submitFiches } from '@/lib/curation-queue';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// REGARDEUR (ou admin) propose une sélection à valider.
export async function POST(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me || !hasPermission(me.id, me.email, 'curation_regardeur')) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as { name?: string; items?: { pid: string; name: string; image: string; cost?: number | null }[] };
  const r = submitFiches(me.id, b.name || 'Sélection', b.items || []);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
  return NextResponse.json({ ok: true, id: r.id });
}
