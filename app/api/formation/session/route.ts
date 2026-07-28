/**
 * Sessions de formation (formateur/validateur). Garde-fou EN AMONT : la session est géolocalisée,
 * le recruté signera sa présence (QR/OTP) → prérequis à la certification.
 *  POST { label?, lat?, lng? } → { session:{ id, code, qr_token, ... } }   (validateur uniquement)
 *  GET  ?mine=1 → { sessions }   ·   GET ?id= → { attendance }
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { hasPermission } from '@/lib/permissions';
import { createSession, listMySessions, listAttendance } from '@/lib/formation-sessions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function isValidateur(me: { id: string; email?: string | null; is_admin?: boolean }): boolean {
  return !!me.is_admin || hasPermission(me.id, me.email || '', 'curation_validateur');
}

export async function GET(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!isValidateur(me)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const id = req.nextUrl.searchParams.get('id');
  if (id) return NextResponse.json({ ok: true, attendance: listAttendance(id) });
  return NextResponse.json({ ok: true, sessions: listMySessions(me.id) });
}

export async function POST(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!isValidateur(me)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  let b: { label?: string; lat?: number; lng?: number } = {};
  try { b = await req.json(); } catch { /* corps vide ok */ }
  const s = createSession(me.id, b.label ? String(b.label).slice(0, 60) : undefined,
    typeof b.lat === 'number' ? b.lat : null, typeof b.lng === 'number' ? b.lng : null);
  return NextResponse.json({ ok: true, session: s });
}
