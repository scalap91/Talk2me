/**
 * POST /api/cards/edit — ÉDITEUR DE CARD, Phase 2 (slice 1 : le texte/légende).
 * Doctrine : on écrit la SOURCE (colonne réelle), puis on re-sérialise le `.card` →
 * tous les lecteurs (feed, recherche, profil…) reflètent le changement. Aucune duplication.
 * PROPRIÉTAIRE uniquement (le setter vérifie user_id). Champs sûrs d'abord (pas le prix).
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { updateDirectCardFields } from '@/lib/db';
import { cardFromDirectCard } from '@/lib/cards/composer-io';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let body: { id?: string; text?: string; category?: string; media_url?: string } = {};
  try { body = await req.json(); } catch { /* */ }
  if (!body.id) return NextResponse.json({ error: 'bad_body' }, { status: 400 });

  const patch: { text?: string; category?: string; media_url?: string } = {};
  if (typeof body.text === 'string') patch.text = body.text;
  if (typeof body.category === 'string') patch.category = body.category;
  if (typeof body.media_url === 'string') patch.media_url = body.media_url;
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'nothing_to_edit' }, { status: 400 });

  const updated = updateDirectCardFields(body.id, me.id, patch);
  if (!updated) return NextResponse.json({ error: 'forbidden_or_not_found' }, { status: 403 });

  // Renvoie le `.card` frais pour que l'inspecteur rafraîchisse tout de suite.
  return NextResponse.json({ ok: true, card: cardFromDirectCard(updated) });
}
