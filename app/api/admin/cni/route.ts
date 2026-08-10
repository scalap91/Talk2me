/**
 * Talk2Me — Super-Admin : file de vérification CNI (Brique A).
 * GET  ?status=pending → dossiers à vérifier (numéro CNI déchiffré, admin only).
 * POST { user_id, action: 'verify'|'reject', reason? } → statut KYC.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { isAiOpsAdmin } from '@/lib/ai-ops/auth';
import { hasPermission } from '@/lib/permissions';
import { listCniQueue, setCniStatus, type CniStatus } from '@/lib/transport-profile';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VALID_STATUS: CniStatus[] = ['none', 'pending', 'verified', 'rejected'];
// Vérif CNI = VALIDATEUR (gouvernance, curation_validateur) OU super-admin (secours). Pascal 2026-08-10.
const canVerifyCni = (id: string, email: string | null | undefined) => isAiOpsAdmin(id, email) || hasPermission(id, email, 'curation_validateur');

export async function GET(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me || !canVerifyCni(me.id, me.email)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const s = (req.nextUrl.searchParams.get('status') || 'pending') as CniStatus;
  const status = VALID_STATUS.includes(s) ? s : 'pending';
  return NextResponse.json({ ok: true, items: listCniQueue(status) });
}

export async function POST(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me || !canVerifyCni(me.id, me.email)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  let b: { user_id?: string; action?: string; reason?: string } = {};
  try { b = await req.json(); } catch { return NextResponse.json({ error: 'bad_body' }, { status: 400 }); }
  if (!b.user_id || (b.action !== 'verify' && b.action !== 'reject')) return NextResponse.json({ error: 'bad_args' }, { status: 400 });
  setCniStatus(b.user_id, b.action, b.reason);
  return NextResponse.json({ ok: true, items: listCniQueue('pending') });
}
