/**
 * POST /api/auth/phone/verify { phone, code }
 * Vérifie l'OTP → connecte (login) ou crée le compte (signup unifié) → pose la session.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { normalizePhone } from '@/lib/phone';
import { verifyPhoneOtp } from '@/lib/phone-auth';
import { createSession, getUserByPhone, createUser } from '@/lib/db';
import { SESSION_COOKIE, sessionCookieAttrs } from '@/lib/auth-constants';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({} as Record<string, unknown>));
  const phone = normalizePhone(typeof body.phone === 'string' ? body.phone : '');
  const code = typeof body.code === 'string' ? body.code.trim() : '';
  if (!phone || !/^\d{6}$/.test(code)) {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  }
  if (!verifyPhoneOtp(phone, code)) {
    return NextResponse.json({ error: 'invalid_code' }, { status: 401 });
  }

  let user = getUserByPhone(phone);
  if (!user) {
    try {
      user = createUser({ phone });
    } catch (e) {
      if (e instanceof Error && e.message === 'phone_taken') user = getUserByPhone(phone);
      if (!user) return NextResponse.json({ error: 'signup_failed' }, { status: 500 });
    }
  }

  const session = createSession(user.id);
  const res = NextResponse.json({ ok: true });
  res.headers.set('Set-Cookie', `${SESSION_COOKIE}=${session.token}; ${sessionCookieAttrs()}`);
  return res;
}
