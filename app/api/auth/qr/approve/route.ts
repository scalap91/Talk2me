/**
 * POST /api/auth/qr/approve { t } — Mobile DÉJÀ connecté : approuve l'appairage
 * du desktop. Exige une session valide (sinon 401). On crée une session pour CE
 * user, rangée dans la ligne du token → le desktop la récupère via /status.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { approveLinkToken } from '@/lib/web-link';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const b = await req.json().catch(() => ({} as Record<string, unknown>));
  const token = typeof b.t === 'string' ? b.t : '';
  if (!token) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  const r = approveLinkToken(token, me.id);
  if (!r.ok) return NextResponse.json({ error: r.error || 'failed' }, { status: 400 });
  return NextResponse.json({ ok: true });
}
