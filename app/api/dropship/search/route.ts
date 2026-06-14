/** Talk2Me — Dropshipping : recherche de produits fournisseur (CJdropshipping).
 *  GET ?q=<terme>&page=  → { ok, configured, products:[{pid,name,image,price,sku}] }
 *  Données RÉELLES (grounding). Si pas de clé CJ → configured:false (honnête). */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { cjConfigured, cjSearchProducts, CjError } from '@/lib/cj-dropshipping';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!cjConfigured())
    return NextResponse.json({ ok: true, configured: false, products: [] });
  const q = (req.nextUrl.searchParams.get('q') || '').trim();
  const page = parseInt(req.nextUrl.searchParams.get('page') || '1', 10) || 1;
  if (!q) return NextResponse.json({ ok: true, configured: true, products: [] });
  try {
    const products = await cjSearchProducts(q, page);
    return NextResponse.json({ ok: true, configured: true, products });
  } catch (e) {
    const code = e instanceof CjError ? e.code : 'error';
    return NextResponse.json({ ok: false, configured: true, error: code }, { status: 502 });
  }
}
