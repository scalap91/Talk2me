/** Talk2Me — Dropshipping : importer un produit fournisseur dans MA boutique.
 *  POST { boutique_id, pid, price, category? }
 *   - récupère le détail réel du produit chez CJ (photo, nom)
 *   - crée une card produit dans la boutique (prix = TON prix de vente)
 *   - garde le pid + le coût fournisseur pour la commande automatique plus tard
 *  Le vendeur ne stocke rien : à la vente, CJ expédiera (entrepôt France). */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { getDb, createDirectCard } from '@/lib/db';
import { cjConfigured, cjProductDetail, CjError } from '@/lib/cj-dropshipping';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!cjConfigured()) return NextResponse.json({ error: 'cj_not_configured' }, { status: 400 });

  const b = (await req.json().catch(() => ({}))) as {
    boutique_id?: string;
    pid?: string;
    price?: string | number;
    category?: string;
  };
  if (!b.boutique_id || !b.pid) return NextResponse.json({ error: 'bad_args' }, { status: 400 });

  // La boutique doit appartenir à l'utilisateur.
  const bq = getDb()
    .prepare('SELECT id, user_id, kind FROM boutiques WHERE id = ?')
    .get(b.boutique_id) as { id: string; user_id: string; kind: string } | undefined;
  if (!bq) return NextResponse.json({ error: 'no_boutique' }, { status: 404 });
  if (bq.user_id !== me.id) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  let detail;
  try {
    detail = await cjProductDetail(b.pid);
  } catch (e) {
    const code = e instanceof CjError ? e.code : 'error';
    return NextResponse.json({ error: code }, { status: 502 });
  }
  if (!detail.image) return NextResponse.json({ error: 'no_image' }, { status: 422 });

  // Prix de vente = ce que le vendeur fixe ; à défaut, le coût fournisseur.
  const sellPrice =
    b.price != null && String(b.price).trim() ? String(b.price).trim() : detail.price != null ? `${detail.price}` : '';

  const attachedProduct = {
    title: detail.name,
    image_url: detail.image,
    price_label: sellPrice,
    source: 'CJ',
    source_url: '',
    // métadonnées de fulfillment (sert la commande auto + marge)
    cj_pid: detail.pid,
    cost: detail.price,
    dropship: true,
  };

  const card = createDirectCard(me.id, {
    type: 'image',
    media_url: detail.image,
    caption: detail.name,
    attached_product_json: JSON.stringify(attachedProduct),
    boutique_id: b.boutique_id,
    category: (b.category || 'Boutique').trim(),
  });

  return NextResponse.json({ ok: true, card_id: card.id });
}
