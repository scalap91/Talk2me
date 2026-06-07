import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import {
  consumeMagicLink,
  createSession,
  createUser,
  getUserByEmail,
  getUserById,
} from '@/lib/db';
import { SESSION_COOKIE, sessionCookieAttrs } from '@/lib/auth-constants';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function baseUrlFromRequest(req: NextRequest): string {
  const override = process.env.TALK2ME_PUBLIC_URL;
  if (override) return override.replace(/\/+$/, '');
  const proto = req.headers.get('x-forwarded-proto') || 'https';
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || req.nextUrl.host;
  return `${proto}://${host}`;
}

/**
 * GET /api/auth/magic-link/verify/[token]
 *
 * Le user arrive ici en cliquant le lien dans l'email.
 * - consume le token (one-shot, 15 min)
 * - retrouve ou crée le user (signup unifié au premier verify)
 * - crée la session + set-cookie
 * - redirect 302 → /
 *
 * En cas d'échec, redirect → /signin?error=invalid_link (ou expired/used).
 */
export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ token: string }> },
) {
  const { token } = await ctx.params;
  const base = baseUrlFromRequest(request);
  const consumed = consumeMagicLink(token);
  if (!consumed) {
    const url = new URL('/signin', base);
    url.searchParams.set('error', 'invalid_link');
    return NextResponse.redirect(url);
  }

  let user = consumed.user_id ? getUserById(consumed.user_id) : null;
  if (!user) {
    // Si le user_id du link a disparu (rare), retombons sur l'email.
    user = getUserByEmail(consumed.email);
  }
  if (!user) {
    try {
      user = createUser({ email: consumed.email });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'create_failed';
      // Race possible : un autre tab a créé le compte entre-temps.
      if (msg === 'email_taken') {
        user = getUserByEmail(consumed.email);
      }
      if (!user) {
        const url = new URL('/signin', base);
        url.searchParams.set('error', 'signup_failed');
        return NextResponse.redirect(url);
      }
    }
  }

  const session = createSession(user.id);
  // Talk2Me (Pascal 2026-06-07) : après login on atterrit sur le Hub, pas sur
  // le chat solo Léa (qui reste accessible via Messages/Amis → conv agent).
  const res = NextResponse.redirect(new URL('/home', base));
  res.headers.set(
    'Set-Cookie',
    `${SESSION_COOKIE}=${session.token}; ${sessionCookieAttrs()}`,
  );
  return res;
}
