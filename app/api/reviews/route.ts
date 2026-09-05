/** AVIS — module générique. GET ?target=<ref> → { summary, reviews, mine }.
 *  POST { target, stars, comment, context? } → poser/mettre à jour son avis (auteur = compte CIN).
 *  Anti-faux-avis : pour un bien LOCAT (target 'locat:<id>'), il faut l'avoir VRAIMENT loué. */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { addReview, listReviews, reviewSummary, myReview } from '@/lib/reviews';
import { hasRentedItem } from '@/lib/rental-calendar';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET(req: NextRequest) {
  const target = req.nextUrl.searchParams.get('target') || '';
  if (!target) return NextResponse.json({ error: 'missing_target' }, { status: 400 });
  const me = getCurrentUserFromRequest(req);
  return NextResponse.json({ ok: true, summary: reviewSummary(target), reviews: listReviews(target), mine: me ? myReview(target, me.id) : null });
}

export async function POST(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const target = String(b.target || '');
  const stars = Number(b.stars) || 0;
  const comment = typeof b.comment === 'string' ? b.comment : '';
  const context = typeof b.context === 'string' ? b.context : null;
  if (!target || stars < 1 || stars > 5) return NextResponse.json({ error: 'bad_request' }, { status: 400 });

  // Anti-faux-avis LOCAT : l'auteur doit avoir loué le bien.
  if (target.startsWith('locat:')) {
    const itemId = target.slice('locat:'.length);
    if (!hasRentedItem(me.id, itemId)) return NextResponse.json({ error: 'must_have_rented' }, { status: 403 });
  }
  return NextResponse.json(addReview({ targetRef: target, authorId: me.id, stars, comment, contextRef: context }));
}
