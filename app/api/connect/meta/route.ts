import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { meta } from '@/lib/social/oauth';
import { randomUUID } from 'crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Démarre l'OAuth Meta (Facebook Pages + Instagram).
export async function GET(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.redirect(new URL('/signin', req.url));
  if (!meta.configured) return NextResponse.redirect(new URL('/home?connect_error=meta_not_configured', req.url));
  return NextResponse.redirect(meta.authUrl(randomUUID()));
}
