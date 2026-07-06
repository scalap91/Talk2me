/**
 * POST /api/cards/wipe-feed — "ON PART PROPRE" (Pascal 2026-06-30).
 * WIPE DUR des cards sociales du feed (image/video/texte) + miroirs/likes/commentaires.
 * Repart d'un feed vide pour que TOUT soit du `.card` frais (Card OS).
 *
 * SUPPRIME : direct_cards (boutique_id IS NULL) + unified_posts source='direct_card'
 *            + card_likes/card_comments correspondants.
 * PRÉSERVE : users, boutiques, PRODUITS de boutique, brouillons, conversations,
 *            messages, clips de conversation.
 *
 * Irréversible. Super-admin only. GARDE-FOU : exige ?confirm=VIRE-TOUT (ou body)
 * pour éviter un déclenchement accidentel.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { isAiOpsAdmin } from '@/lib/ai-ops/auth';
import { wipeFeed } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PHRASE = 'VIRE-TOUT';

export async function POST(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me || !isAiOpsAdmin(me.id, me.email)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const url = new URL(req.url);
  const fromQuery = url.searchParams.get('confirm');
  let fromBody: string | undefined;
  try { fromBody = (await req.json())?.confirm; } catch { /* pas de body */ }
  if (fromQuery !== PHRASE && fromBody !== PHRASE) {
    return NextResponse.json(
      { error: 'confirmation_required', hint: `POST avec ?confirm=${PHRASE}`, willDelete: 'feed social cards (direct_cards, boutique_id NULL) + likes/comments/unified' },
      { status: 400 }
    );
  }
  const deleted = wipeFeed();
  return NextResponse.json({ ok: true, deleted });
}
