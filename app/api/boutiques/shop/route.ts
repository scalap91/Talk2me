import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { getBoutiquesForShop, getBoutiqueProducts } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const user = await getCurrentUserFromRequest(req);
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const boutiques = getBoutiquesForShop(20).map((b) => {
    // Talk2Me #428 — aperçu : mini-cards d'articles (photo + titre + prix) qui
    // s'affichent l'une après l'autre dans la miniature de boutique.
    const preview_articles: { image_url: string; title: string; price_label: string }[] = [];
    for (const c of getBoutiqueProducts(b.id)) {
      let p: { image_url?: string; title?: string; price_label?: string } | null = null;
      try {
        p = c.attached_product_json ? JSON.parse(c.attached_product_json) : null;
      } catch {
        p = null;
      }
      const image_url = (p?.image_url && String(p.image_url)) || c.media_url || '';
      const title = (p?.title && String(p.title)) || c.caption || '';
      const price_label = (p?.price_label && String(p.price_label)) || '';
      if (image_url) preview_articles.push({ image_url, title, price_label });
      if (preview_articles.length >= 8) break;
    }
    return { ...b, preview_articles };
  });
  return NextResponse.json({ ok: true, boutiques });
}
