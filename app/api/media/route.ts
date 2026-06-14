import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { listUserMediaView } from '@/lib/user-media';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET ?q=&kind= — APERÇU (lecture seule) de mes médias existants. AUCUNE copie.
export async function GET(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const url = new URL(req.url);
  const q = url.searchParams.get('q') || undefined;
  const kind = url.searchParams.get('kind') || undefined;
  return NextResponse.json({ ok: true, media: listUserMediaView(me.id, { q, kind }) });
}
