/**
 * POST /api/dev/test-login — Porte de connexion pour la FLOTTE DE TEST (Pascal 2026-07-01).
 * Crée/connecte un utilisateur de test SANS SMS/OTP, pour que des bots exercent toute
 * l'app (Drive/Eat/plat maison…) et remontent les blocages.
 *
 * VERROUS (impossible d'en abuser) :
 *  1. actif SEULEMENT si l'env TEST_LOGIN_SECRET est défini (présent sur dev, ABSENT sur
 *     prod → 403 permanent en prod) ET header x-test-secret correspondant ;
 *  2. UNIQUEMENT des téléphones de test réservés (+9990…) → ne peut jamais toucher un vrai
 *     compte.
 *
 * Body : { phone: "+9990…", name? }  →  { ok, token, user_id, username }
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createUser, createSession, getUserByPhone } from '@/lib/db';
import { SESSION_COOKIE, sessionCookieAttrs } from '@/lib/auth-constants';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TEST_PHONE_RE = /^\+9990\d{5,10}$/; // plage de test réservée

export async function POST(req: NextRequest) {
  const secret = process.env.TEST_LOGIN_SECRET;
  if (!secret || req.headers.get('x-test-secret') !== secret) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  let body: { phone?: unknown; name?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid_body' }, { status: 400 }); }

  const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
  if (!TEST_PHONE_RE.test(phone)) return NextResponse.json({ error: 'invalid_test_phone' }, { status: 400 });
  const name = typeof body.name === 'string' ? body.name.slice(0, 40) : undefined;

  let user = getUserByPhone(phone);
  if (!user) {
    try { user = createUser({ phone, displayName: name }); }
    catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : 'signup_failed' }, { status: 500 }); }
  }

  const session = createSession(user.id);
  const res = NextResponse.json({ ok: true, token: session.token, user_id: user.id, username: user.username });
  res.headers.set('Set-Cookie', `${SESSION_COOKIE}=${session.token}; ${sessionCookieAttrs()}`);
  return res;
}
