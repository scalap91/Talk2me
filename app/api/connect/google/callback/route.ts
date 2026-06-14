import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { google, googleExchange } from '@/lib/social/oauth';
import { upsertAccount } from '@/lib/connected-accounts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.redirect(new URL('/signin', req.url));
  const code = req.nextUrl.searchParams.get('code');
  if (!code || !google.configured) return NextResponse.redirect(new URL('/home?connect_error=google', req.url));
  try {
    const r = await googleExchange(code);
    upsertAccount(me.id, 'youtube', { externalId: r.channel?.id, name: r.channel?.title || 'YouTube', accessToken: r.accessToken, refreshToken: r.refreshToken, expiresAt: r.expiresAt });
    return NextResponse.redirect(new URL('/home?connected=youtube', req.url));
  } catch {
    return NextResponse.redirect(new URL('/home?connect_error=google', req.url));
  }
}
