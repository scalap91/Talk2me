/**
 * Talk2Me — CM assisté groupe FB (Pascal 2026-06-22). Super-admin.
 * GET  → posts prêts (annonces publiées non encore postées dans le groupe).
 * POST { annonce_id } → marque "posté" (retiré de la file).
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { isAiOpsAdmin } from '@/lib/ai-ops/auth';
import { listPendingGroupPosts, markGroupPosted } from '@/lib/cm-assist';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me || !isAiOpsAdmin(me.id, me.email)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  return NextResponse.json({ ok: true, posts: listPendingGroupPosts() });
}

export async function POST(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me || !isAiOpsAdmin(me.id, me.email)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  let b: { annonce_id?: string } = {};
  try { b = await req.json(); } catch { return NextResponse.json({ error: 'bad_body' }, { status: 400 }); }
  if (!b.annonce_id) return NextResponse.json({ error: 'annonce_id_required' }, { status: 400 });
  markGroupPosted(b.annonce_id);
  return NextResponse.json({ ok: true, posts: listPendingGroupPosts() });
}
