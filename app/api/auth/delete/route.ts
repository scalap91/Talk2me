/**
 * /api/auth/delete — Suppression de compte in-app (Apple 5.1.1, obligatoire).
 * Anonymise le compte (RGPD), purge les sessions, soft-delete les contenus, déconnecte.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest, SESSION_COOKIE } from '@/lib/auth';
import { deleteAccount } from '@/lib/moderation';
import { deleteSession } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function clearCookieHeader(): string {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${SESSION_COOKIE}=; HttpOnly${secure}; SameSite=Lax; Path=/; Max-Age=0`;
}

export async function POST(request: NextRequest) {
  const me = getCurrentUserFromRequest(request);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  deleteAccount(me.id);
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (token) deleteSession(token);
  const res = NextResponse.json({ ok: true });
  res.headers.set('Set-Cookie', clearCookieHeader());
  return res;
}
