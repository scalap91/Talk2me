/**
 * POST /api/dev/backfill-direct-cards — Card OS (Pascal 2026-07-03).
 * Met les direct_cards existantes DANS le moteur : parse leur `.card` inline (colonne
 * dotcard) → cardRepository.save (index) + writeCardFile (fichier durable). Idempotent.
 * Après ça, /api/card-file trouve TOUTES les cards (plus de « not found »).
 * Gate : admin OU header x-dev-secret == TEST_LOGIN_SECRET (pour lancement serveur).
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { isAdminCapable } from '@/lib/permissions';
import { getDb } from '@/lib/db';
import { parseCard } from '@/lib/cards/supercard';
import { writeCardFile } from '@/lib/cards/card-file';
import { cardRepository } from '@/lib/cards/engine/card.repository';
import { getPosts } from '@/lib/db-posts';
import { toPostResponse } from '@/app/api/posts/route';
import { fromPost } from '@/lib/cards/adapt';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const secret = request.headers.get('x-dev-secret');
  const bySecret = !!secret && secret === process.env.TEST_LOGIN_SECRET;
  if (!bySecret) {
    const me = getCurrentUserFromRequest(request);
    if (!me || !isAdminCapable(me.id, me.email)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const rows = getDb()
    .prepare("SELECT id, dotcard FROM direct_cards WHERE deleted_at IS NULL AND dotcard IS NOT NULL AND dotcard != ''")
    .all() as Array<{ id: string; dotcard: string }>;

  let saved = 0, failed = 0;
  for (const r of rows) {
    try {
      const p = parseCard(r.dotcard);
      if (!p.ok || !p.card) { failed++; continue; }
      await writeCardFile(p.card);            // fichier .card (artefact)
      try { cardRepository.save(p.card); } catch { /* index best-effort */ } // INDEX cards = source du feed
      saved++;
    } catch { failed++; }
  }
  // Posts (conv-clips) : émettre leur `.card` via fromPost → fichier.
  let postsSaved = 0, postsFailed = 0;
  try {
    for (const post of getPosts(1000)) {
      try {
        await writeCardFile(fromPost(toPostResponse(post) as unknown as Parameters<typeof fromPost>[0]));
        postsSaved++;
      } catch { postsFailed++; }
    }
  } catch { /* getPosts a échoué */ }

  return NextResponse.json({
    direct_cards: { total: rows.length, saved, failed },
    posts: { saved: postsSaved, failed: postsFailed },
  });
}
