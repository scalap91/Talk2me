import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { hasPermission } from '@/lib/permissions';
import { decideSubmission } from '@/lib/curation-queue';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// VALIDATEUR/ADMIN : valide ou refuse une proposition.
export async function POST(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me || !hasPermission(me.id, me.email, 'curation_validateur')) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as { id?: string; decision?: string; note?: string };
  if (!b.id || (b.decision !== 'validated' && b.decision !== 'rejected')) return NextResponse.json({ error: 'bad_args' }, { status: 400 });
  const r = await decideSubmission(b.id, me.id, b.decision, b.note);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
  return NextResponse.json({ ok: true, slug: r.slug });
}
