/** Talk2Me — Sélecteur : PUBLIER la sélection dans une boutique.
 *  POST { boutique_id?, name?, category?, items:[{pid,name,image,cost}] }
 *   - boutique_id → ajoute à une boutique existante ; sinon crée avec `name`.
 *   - traduit les fiches en FR (agent), prix de vente = coût × marge.
 *  C'est la curation PAR L'HUMAIN : l'user a choisi, on publie. */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { publishSelection, type SelItem } from '@/lib/dropship-publish';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { boutique_id?: string; name?: string; category?: string; items?: SelItem[] };
  const r = await publishSelection(me.id, { name: b.name, boutiqueId: b.boutique_id, category: b.category, items: b.items || [] });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.error === 'no_items' ? 400 : r.error === 'no_boutique' ? 404 : 403 });
  return NextResponse.json({ ok: true, boutique_id: r.boutique_id, slug: r.slug, count: r.count });
}
