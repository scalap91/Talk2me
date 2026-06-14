/** Talk2Me — Boutique en 1 CLIC (#429).
 *  GET  → liste des thèmes curés proposés.
 *  POST { theme?, name? } → crée une boutique dropship + la REMPLIT de vrais
 *    produits fournisseur (CJ), prix de vente suggéré (marge), slug à partager.
 *  Capital zéro, setup zéro : un tap = un magasin qui tourne. */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { createBoutique, createDirectCard } from '@/lib/db';
import { cjConfigured, cjSearchProducts, CjError } from '@/lib/cj-dropshipping';
import { merchantSelect } from '@/lib/agent-merchant';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
import { BOUTIQUE_THEMES, THEME_MAP, suggestedPrice } from '@/lib/boutique-oneclick';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  return NextResponse.json({
    ok: true,
    configured: cjConfigured(),
    themes: BOUTIQUE_THEMES.map((t) => ({ key: t.key, name: t.name, emoji: t.emoji })),
  });
}

export async function POST(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!cjConfigured()) return NextResponse.json({ error: 'cj_not_configured' }, { status: 400 });

  const body = (await req.json().catch(() => ({}))) as { theme?: string; name?: string };
  const theme = (body.theme && THEME_MAP[body.theme]) || BOUTIQUE_THEMES[0];
  const boutiqueName = (body.name?.trim() || theme.name).slice(0, 80);

  // Créer le magasin dropship.
  const boutique = createBoutique(
    me.id,
    { name: boutiqueName, description: `Magasin ${theme.name.toLowerCase()}`, kind: 'dropship' },
    Date.now()
  );

  // Remplir RAYON par RAYON. Pour chaque rayon : on prend un LARGE vivier, et
  // l'AGENT MARCHAND sélectionne les meilleurs + écrit les fiches en FRANÇAIS.
  // Pas d'appel détail en masse (→ zéro rate-limit) : image = recherche, fiche = agent.
  let count = 0;
  let firstError: string | null = null;
  for (let i = 0; i < theme.rows.length; i++) {
    const row = theme.rows[i];
    if (i > 0) await sleep(800); // espacer les recherches CJ
    let products;
    try {
      products = await cjSearchProducts(row.query, 1, 20, row.categoryId);
    } catch (e) {
      firstError = firstError || (e instanceof CjError ? e.code : 'error');
      continue;
    }
    const usable = products.filter((p) => p.image && p.name);
    if (usable.length === 0) continue;
    const byPid = new Map(usable.map((p) => [p.pid, p]));

    // L'agent choisit + traduit. Fallback (agent indispo) : 4 premiers bruts.
    const picks = await merchantSelect(
      usable.map((p) => ({ pid: p.pid, name: p.name, price: p.price })),
      `${theme.name} (${row.name})`,
      4
    );
    const chosen =
      picks.length > 0
        ? picks
        : usable.slice(0, 4).map((p) => ({ pid: p.pid, fr_title: p.name, fr_description: '' }));

    for (const ch of chosen) {
      const cand = byPid.get(ch.pid);
      if (!cand) continue;
      const attached = {
        title: ch.fr_title,
        image_url: cand.image,
        price_label: suggestedPrice(cand.price),
        sizes: '',
        description: ch.fr_description,
        source: 'CJ',
        source_url: '',
        cj_pid: cand.pid,
        cost: cand.price,
        dropship: true,
      };
      try {
        createDirectCard(me.id, {
          type: 'image',
          media_url: cand.image,
          caption: ch.fr_title,
          attached_product_json: JSON.stringify(attached),
          boutique_id: boutique.id,
          category: row.name,
        });
        count++;
      } catch {
        /* on saute ce produit */
      }
    }
  }

  if (count === 0) return NextResponse.json({ error: firstError || 'no_products' }, { status: 502 });

  return NextResponse.json({
    ok: true,
    boutique: { id: boutique.id, slug: boutique.slug, name: boutique.name },
    count,
    rows: theme.rows.length,
  });
}
