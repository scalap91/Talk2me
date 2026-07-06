/**
 * GET /api/referral/who?code=<pseudo|talk2me_id> → info publique du parrain
 * (pour la page d'invitation /r/<code>). Minimal : pseudo/nom/avatar.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { inviterPublic } from '@/lib/referral';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const code = (req.nextUrl.searchParams.get('code') || '').trim();
  if (!code) return NextResponse.json({ error: 'code_required' }, { status: 400 });
  const inviter = inviterPublic(code);
  if (!inviter) return NextResponse.json({ ok: false }, { status: 404 });
  return NextResponse.json({ ok: true, inviter });
}
