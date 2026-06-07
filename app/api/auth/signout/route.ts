import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { deleteSession } from '@/lib/db';
import { SESSION_COOKIE } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function clearCookieHeader(): string {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${SESSION_COOKIE}=; HttpOnly${secure}; SameSite=Lax; Path=/; Max-Age=0`;
}

export async function POST(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (token) deleteSession(token);
  const res = NextResponse.json({ ok: true });
  res.headers.set('Set-Cookie', clearCookieHeader());
  return res;
}

// Alias GET pour permettre un simple `<a href="/api/auth/signout">` si besoin.
export async function GET(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (token) deleteSession(token);
  const res = NextResponse.redirect(new URL('/signin', request.url));
  res.headers.set('Set-Cookie', clearCookieHeader());
  return res;
}
