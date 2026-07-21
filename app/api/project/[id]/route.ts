import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { loadProject } from '@/lib/cards/project/store';
import { renderCard, type ReadContext } from '@/lib/cards/v2/reader/reader';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };
const flagOff = () => process.env.SUPERCARD_PROJECT_V1 !== '1';

/** GET /api/project/:id?context=full — lit la carte projet + la projette via le lecteur unique. */
export async function GET(req: NextRequest, ctx: Ctx) {
  if (flagOff()) return NextResponse.json({ error: 'disabled' }, { status: 404 });
  const { id } = await ctx.params;
  const card = await loadProject(id);
  if (!card) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const context = (req.nextUrl.searchParams.get('context') || 'full') as ReadContext;
  return NextResponse.json({ id: card.id, card, view: renderCard(card, context) });
}
