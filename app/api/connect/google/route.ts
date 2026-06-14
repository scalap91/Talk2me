import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { google } from '@/lib/social/oauth';
import { randomUUID } from 'crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.redirect(new URL('/signin', req.url));
  if (!google.configured) return NextResponse.redirect(new URL('/home?connect_error=google_not_configured', req.url));
  return NextResponse.redirect(google.authUrl(randomUUID()));
}
