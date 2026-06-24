/**
 * Talk2Me — données d'affichage d'UNE card par id (public, lecture seule). Sert à la page de
 * rendu /card-render utilisée pour générer l'aperçu screenshot de la recherche. Pas de PII.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id_required' }, { status: 400 });
  const c = getDb().prepare(
    'SELECT id, type, media_url, caption, text, bg_variant, attached_audio_json, post_type, likes, views FROM direct_cards WHERE id = ? AND deleted_at IS NULL'
  ).get(id) as Record<string, unknown> | undefined;
  if (!c) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const kind = c.type === 'video' ? 'video_card' : c.type === 'texte' ? 'texte_card' : 'image_card';
  return NextResponse.json({ ok: true, card: { ...c, kind } });
}
