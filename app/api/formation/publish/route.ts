/**
 * POST /api/formation/publish (Pascal 2026-07-03)
 * Plan de formation VALIDÉ (par l'humain) → card FORMATION-conteneur persistée.
 * Mirror de la boutique : direct_card (handle feed/Mes Cards, marqueur [FORMATION]) +
 * `.card` conteneur (modules en items). Le contenu complet vit dans le `.card` ; le
 * verrouillage des modules payants se fait au SERVICE (voir /api/formation/[id]).
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { createDirectCard } from '@/lib/db';
import { writeCardFile } from '@/lib/cards/card-file';
import { buildFormationCard, type FormationCardInput } from '@/lib/formation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DEFAULT_COVER = 'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?w=800';

export async function POST(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let body: Partial<FormationCardInput>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'bad_json' }, { status: 400 }); }

  const title = (body.title || '').trim();
  const modules = Array.isArray(body.modules) ? body.modules.filter((m) => m && (m.content || '').trim()) : [];
  if (!title) return NextResponse.json({ error: 'no_title', message: 'Donne un titre à ta formation.' }, { status: 400 });
  if (modules.length === 0) return NextResponse.json({ error: 'no_modules', message: 'Ajoute au moins un module.' }, { status: 400 });

  const cover = (body.cover || '').trim() || DEFAULT_COVER;
  const price = Number.isFinite(body.price_mga) ? Math.max(0, Math.round(body.price_mga!)) : 0;
  const description = (body.description || '').trim();

  const card = createDirectCard(me.id, {
    type: 'image', media_url: cover, caption: `${title.slice(0, 60)} [FORMATION]`, category: null,
  });
  await writeCardFile(buildFormationCard(card.id, { title, description, price_mga: price, cover, modules }, me.id));

  return NextResponse.json({ ok: true, card_id: card.id });
}
