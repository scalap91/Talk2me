/**
 * Talk2Me — Contacter le vendeur d'une annonce déposée (Pascal 2026-06-11).
 * POST { annonceId } → conversation P2P acheteur↔déposant (non gatée amitié).
 * Sert l'économie de proximité (ex. plats informels à Madagascar).
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { createP2PConversation } from '@/lib/db';
import { getAnnoncesDb } from '@/lib/annonces-db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const b = await req.json().catch(() => null);
  const id = b && typeof b.annonceId === 'string' ? b.annonceId.trim() : '';
  if (!id) return NextResponse.json({ error: 'annonceId_required' }, { status: 400 });
  const row = getAnnoncesDb().prepare('SELECT user_id, title FROM deposit_annonces WHERE id = ?').get(id) as { user_id?: string; title?: string } | undefined;
  if (!row?.user_id) return NextResponse.json({ error: 'annonce_not_found' }, { status: 404 });
  if (row.user_id === me.id) return NextResponse.json({ error: 'own_annonce' }, { status: 400 });
  try {
    const conv = createP2PConversation(me.id, row.user_id);
    return NextResponse.json({ ok: true, conversationId: conv.id, title: row.title || null });
  } catch (e) {
    return NextResponse.json({ error: 'contact_failed', detail: (e as Error).message }, { status: 500 });
  }
}
