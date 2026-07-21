/**
 * POST /api/cards/ad/publish — publie une PUBLICITÉ (régie) comme VRAI `.card` (Pascal 2026-07-18,
 * unification .card). Écrit le fichier `.card` (writeCardFile) + moteur (table cards) + biblio de
 * l'annonceur (user_library, variant 'pub'). VOLONTAIREMENT PAS de `direct_cards` : une pub n'est
 * JAMAIS un post normal du feed — le moteur régie la sert en bannière/jingle ou pré-roll vidéo,
 * jamais mélangée visuellement (cf régie pub). Le budget a déjà été réglé via PaPi (route /api/ads/fund).
 * Body : { title, advertiser?, format:'banner'|'video', banner?, jingle?, video?, budget?, target:{scope,zone}, card_id? }
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { cardRepository } from '@/lib/cards/engine/card.repository';
import { writeCardFile } from '@/lib/cards/card-file';
import { makeCard, serializeCard } from '@/lib/cards/supercard';
import { randomUUID } from 'node:crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Média SERVEUR uniquement (/uploads). Refuse un fichier local du téléphone.
function upload(u: unknown): string | undefined {
  if (typeof u !== 'string' || !u) return undefined;
  if (u.startsWith('/uploads/')) return u;
  const m = u.match(/^https?:\/\/[^/]+(\/uploads\/.+)$/);
  return m ? m[1] : undefined;
}

export async function POST(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return NextResponse.json({ error: 'bad_json' }, { status: 400 }); }

  const format = b.format === 'video' ? 'video' : 'banner';
  const title = typeof b.title === 'string' ? b.title.trim().slice(0, 120) : '';
  const banner = upload(b.banner), jingle = upload(b.jingle), video = upload(b.video);
  if (format === 'banner' && !banner) return NextResponse.json({ error: 'banner_required' }, { status: 400 });
  if (format === 'video' && !video) return NextResponse.json({ error: 'video_required' }, { status: 400 });
  const budget = Number(b.budget) > 0 ? Math.round(Number(b.budget)) : 0;
  const t = (b.target && typeof b.target === 'object') ? b.target as { scope?: unknown; zone?: unknown } : {};
  const scope = t.scope === 'ville' ? 'ville' : t.scope === 'region' ? 'region' : 'national';
  const zone = typeof t.zone === 'string' ? t.zone.trim().slice(0, 80) : (scope === 'national' ? 'National' : '');

  // ÉDITION : réutilise l'id si la card m'appartient (via ma biblio). Sinon nouvel id.
  const editId = typeof b.card_id === 'string' && b.card_id.trim() ? b.card_id.trim() : null;
  if (editId) {
    const owns = getDb().prepare('SELECT 1 FROM user_library WHERE id = ? AND user_id = ?').get(editId, me.id);
    if (!owns) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  const id = editId ?? randomUUID();

  const card = makeCard({
    id, types: ['pub'], channel: 'ad', title: title || 'Publicité', owner: me.id, state: 'published',
    pub: {
      format, ...(banner ? { banner } : {}), ...(jingle ? { jingle } : {}), ...(video ? { video } : {}),
      ...(budget ? { budget } : {}), target: { scope, ...(zone ? { zone } : {}) }, paid: true,
    },
  });
  try { cardRepository.save(card); } catch { /* best-effort moteur */ }
  await writeCardFile(card); // .card = source de vérité (le moteur régie le relit)
  const dotcard = serializeCard(card);
  getDb().prepare('INSERT OR REPLACE INTO user_library (id, user_id, variant, dotcard, created_at) VALUES (?,?,?,?,?)')
    .run(id, me.id, 'pub', dotcard, Date.now());

  return NextResponse.json({ ok: true, card_id: id, dotcard });
}
