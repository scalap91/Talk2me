import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { meta, metaExchange } from '@/lib/social/oauth';
import { upsertAccount } from '@/lib/connected-accounts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.redirect(new URL('/signin', req.url));
  const code = req.nextUrl.searchParams.get('code');
  if (!code || !meta.configured) return NextResponse.redirect(new URL('/home?connect_error=meta', req.url));
  try {
    const { pages } = await metaExchange(code);
    for (const p of pages) {
      upsertAccount(me.id, 'facebook_page', { externalId: p.id, name: p.name, accessToken: p.token });
      if (p.ig) upsertAccount(me.id, 'instagram', { externalId: p.ig.id, name: '@' + p.ig.username, accessToken: p.token, meta: { ig_user_id: p.ig.id, page_id: p.id } });
    }
    return NextResponse.redirect(new URL('/home?connected=meta', req.url));
  } catch {
    return NextResponse.redirect(new URL('/home?connect_error=meta', req.url));
  }
}
