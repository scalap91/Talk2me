/**
 * Talk2Me — POST DIRECT sur un réseau connecté.
 * POST { provider, media_url?, media_kind?, caption?, title? }.
 * Gated : compte non connecté → 400 not_connected. Tokens jamais exposés.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { publishFacebookPage, publishInstagram, uploadYouTube } from '@/lib/social/publish';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  let b: { provider?: string; media_url?: string; media_kind?: string; caption?: string; title?: string } = {};
  try { b = await req.json(); } catch { return NextResponse.json({ error: 'bad_body' }, { status: 400 }); }
  const cap = (b.caption || '').slice(0, 2000);
  const isVid = b.media_kind === 'video';

  let r: { ok: boolean; id?: string; error?: string };
  if (b.provider === 'facebook_page') {
    r = await publishFacebookPage(me.id, { message: cap, imageUrl: !isVid ? b.media_url : undefined, videoUrl: isVid ? b.media_url : undefined });
  } else if (b.provider === 'instagram') {
    r = await publishInstagram(me.id, { caption: cap, imageUrl: !isVid ? b.media_url : undefined, videoUrl: isVid ? b.media_url : undefined });
  } else if (b.provider === 'youtube') {
    if (!isVid || !b.media_url) return NextResponse.json({ error: 'youtube_needs_video' }, { status: 400 });
    r = await uploadYouTube(me.id, { videoUrl: b.media_url, title: (b.title || cap || 'Talk2Me').slice(0, 100), description: cap });
  } else {
    return NextResponse.json({ error: 'bad_provider' }, { status: 400 });
  }
  if (!r.ok) return NextResponse.json({ error: r.error || 'publish_failed' }, { status: r.error === 'not_connected' ? 400 : 502 });
  return NextResponse.json({ ok: true, id: r.id });
}
