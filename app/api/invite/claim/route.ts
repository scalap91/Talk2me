/**
 * POST /api/invite/claim { key } — à la 1re ouverture d'un invité arrivé par /i/<key> : on met la
 * fiche invitante EN FAVORI **et** dans ENREGISTRÉES (Pascal 2026-08-30 : « les deux »), quel que
 * soit le kind. L'attribution au parrain (referred_by) est déjà posée au signup via le cookie
 * t2m_ref (cf. /r/<code>) — le claim ne touche pas au parrainage. Idempotent (garde-fous anti-doublon).
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { getSimpleShopByKey, isShopFavorite, toggleShopFavorite, getShopVitrinePostId } from '@/lib/simple-shop';
import { saveCard, getDb } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  let key = '';
  try { key = String(((await req.json()) as { key?: unknown })?.key || ''); } catch { /* */ }
  const shop = getSimpleShopByKey(key);
  if (!shop) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (shop.owner_id === me.id) return NextResponse.json({ ok: true, self: true, redirect: `/b/${key}` }); // pas d'auto-favori de sa propre fiche

  // 1) FAVORI (garde : on n'ajoute que si absent, pour ne pas dé-favoriser un toggle).
  let favorited = isShopFavorite(me.id, shop.id);
  if (!favorited) { toggleShopFavorite(me.id, shop.id); favorited = true; }

  // 2) ENREGISTRÉES : on enregistre la CARD VITRINE de la fiche (rendu réel via le lecteur unique).
  //    Anti-doublon : on ne ré-enregistre pas si déjà présent.
  let saved = false;
  const vitrineId = getShopVitrinePostId(shop.id);
  if (vitrineId) {
    try {
      const dup = getDb().prepare(
        "SELECT 1 FROM saved_cards WHERE user_id = ? AND card_data LIKE ? LIMIT 1",
      ).get(me.id, `%"${vitrineId}"%`);
      if (!dup) {
        saveCard({ userId: me.id, cardKind: 'image_card', cardData: { id: vitrineId, kind: 'direct_card' }, title: shop.name });
        saved = true;
      }
    } catch { /* best-effort */ }
  }

  return NextResponse.json({ ok: true, favorited, saved, kind: shop.kind || 'boutique', redirect: `/b/${key}` });
}
