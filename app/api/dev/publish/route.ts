/**
 * Talk2Me Developer — POST /api/dev/publish (Pascal 2026-06-10).
 * Auth : header `Authorization: Bearer <api_key>`. Une app externe (Onyx…) publie
 * un article en card sur SON compte T2M lié. Body : { title, image_url?, link?, summary? }.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getAppByKey, publishArticleForApp } from '@/lib/developer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization') || '';
  const key = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
  const app = getAppByKey(key);
  if (!app) return NextResponse.json({ error: 'invalid_api_key' }, { status: 401 });

  let body: { title?: string; image_url?: string; link?: string; summary?: string } = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'bad_body' }, { status: 400 }); }
  if (!body.title || !body.title.trim()) return NextResponse.json({ error: 'title_required' }, { status: 400 });

  const cardId = publishArticleForApp(app, {
    title: body.title, image_url: body.image_url, link: body.link, summary: body.summary,
  });
  return NextResponse.json({ ok: true, card_id: cardId });
}
