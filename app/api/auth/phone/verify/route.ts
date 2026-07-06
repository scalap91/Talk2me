/**
 * POST /api/auth/phone/verify { phone, code }
 * Vérifie l'OTP → connecte (login) ou crée le compte (signup unifié) → pose la session.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { normalizePhone } from '@/lib/phone';
import { verifyPhoneOtp } from '@/lib/phone-auth';
import { twilioVerifyConfigured, checkVerification } from '@/lib/twilio-verify';
import { createSession, getUserByPhone, createUser } from '@/lib/db';
import { SESSION_COOKIE, sessionCookieAttrs } from '@/lib/auth-constants';
import { linkReferral, REF_COOKIE } from '@/lib/referral';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({} as Record<string, unknown>));
  const phone = normalizePhone(typeof body.phone === 'string' ? body.phone : '');
  const code = typeof body.code === 'string' ? body.code.trim() : '';
  if (!phone || !/^\d{4,8}$/.test(code)) {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  }
  // Twilio Verify si configuré, sinon OTP maison.
  const ok = twilioVerifyConfigured()
    ? (await checkVerification(phone, code)).approved
    : verifyPhoneOtp(phone, code);
  if (!ok) {
    return NextResponse.json({ error: 'invalid_code' }, { status: 401 });
  }

  let user = getUserByPhone(phone);
  let isNewSignup = false;
  if (!user) {
    try {
      user = createUser({ phone });
      isNewSignup = true;
    } catch (e) {
      if (e instanceof Error && e.message === 'phone_taken') user = getUserByPhone(phone);
      if (!user) return NextResponse.json({ error: 'signup_failed' }, { status: 500 });
    }
  }

  // Parrainage (B1) : si nouveau filleul ET cookie de parrainage présent → on lie au parrain.
  if (isNewSignup) {
    const refCode = request.cookies.get(REF_COOKIE)?.value;
    if (refCode) { try { linkReferral(user.id, refCode); } catch { /* */ } }
  }

  const session = createSession(user.id);
  // token renvoyé dans le body → l'APK le stocke en NATIF (SharedPreferences) et le
  // réinjecte lui-même au lancement. Cookie gardé pour le web navigateur.
  const res = NextResponse.json({ ok: true, token: session.token });
  res.headers.set('Set-Cookie', `${SESSION_COOKIE}=${session.token}; ${sessionCookieAttrs()}`);
  return res;
}
