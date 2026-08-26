/**
 * Talk2Me — données d'affichage d'UNE card par id (public, lecture seule). Sert à la page de
 * rendu /card-render utilisée pour générer l'aperçu screenshot de la recherche.
 *
 * Inclut l'AUTEUR (avatar + nom) pour que la vignette affiche la bulle de l'user (sinon « ? »).
 * Pas de PII sensible : juste avatar public + pseudo, comme dans le feed.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getDb, getUserById } from '@/lib/db';
import { cardRepository } from '@/lib/cards/engine/card.repository';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id_required' }, { status: 400 });
  let c = getDb().prepare(
    'SELECT id, user_id, type, media_url, caption, text, bg_variant, attached_audio_json, attached_product_json, post_type, likes, views, comment_count FROM direct_cards WHERE id = ? AND deleted_at IS NULL'
  ).get(id) as Record<string, unknown> | undefined;
  // FALLBACK MOTEUR (Pascal 2026-08-26) : un BROUILLON est un .card `state='draft'` SANS ligne
  // direct_cards → on le charge depuis l'index cards pour que la reprise (?card=) pré-remplisse le composer.
  if (!c) {
    const sc = cardRepository.findById(id);
    if (sc) {
      const t = sc.types?.includes('video') ? 'video' : sc.types?.includes('image') ? 'image' : 'texte';
      const media = sc.images?.[0] || sc.video?.url || null;
      const body = sc.text?.body ?? null;
      c = {
        id: sc.id, user_id: sc.owner ?? null, type: t, media_url: media,
        caption: t === 'texte' ? null : body, text: body, bg_variant: null,
        attached_audio_json: sc.audio ? JSON.stringify(sc.audio) : null,
        attached_product_json: null, post_type: null, likes: 0, views: 0, comment_count: 0,
      } as Record<string, unknown>;
    }
  }
  if (!c) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const kind = c.type === 'video' ? 'video_card' : c.type === 'texte' ? 'texte_card' : 'image_card';

  // Auteur (bulle avatar + nom) — comme dans le feed, sinon le rendu affiche « ? ».
  let author: { id: string; display_name: string | null; username: string; avatar_url: string | null } | null = null;
  try {
    const u = c.user_id ? getUserById(String(c.user_id)) : null;
    if (u) author = { id: u.id, display_name: u.display_name ?? null, username: u.username, avatar_url: u.avatar_url ?? null };
  } catch { /* */ }

  return NextResponse.json({ ok: true, card: { ...c, kind, author } });
}
