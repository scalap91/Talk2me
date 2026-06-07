/**
 * Talk2Me #428 — POST /api/boutiques/[id]/import-csv
 * Import en masse de produits dans une boutique via CSV.
 * Colonnes acceptées (entête, ordre libre, insensible casse/accents) :
 *   title (ou titre, nom) | price (prix) | image (image_url, photo) |
 *   category (categorie) | url (lien, source_url)
 * Doctrine [[content-grounding]] : on n'invente rien, on importe les lignes.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { getBoutiqueById, createDirectCard } from '@/lib/db';
import type { ProductCardData } from '@/lib/chat-types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const norm = (s: string) =>
  s.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// Parse CSV simple (gère les guillemets, séparateur , ou ;).
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = '';
  let inQ = false;
  const sepGuess = (text.split('\n')[0].match(/;/g)?.length ?? 0) > (text.split('\n')[0].match(/,/g)?.length ?? 0) ? ';' : ',';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cur += '"'; i++; }
        else inQ = false;
      } else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === sepGuess) { row.push(cur); cur = ''; }
    else if (ch === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
    else if (ch === '\r') { /* skip */ }
    else cur += ch;
  }
  if (cur.length || row.length) { row.push(cur); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim().length));
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await params;
  const boutique = getBoutiqueById(id);
  if (!boutique) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (boutique.user_id !== me.id) return NextResponse.json({ error: 'not_owner' }, { status: 403 });

  let body: { csv?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const csv = typeof body.csv === 'string' ? body.csv : '';
  if (!csv.trim()) return NextResponse.json({ error: 'empty_csv' }, { status: 400 });

  const rows = parseCsv(csv);
  if (rows.length < 2) return NextResponse.json({ error: 'no_rows' }, { status: 400 });

  const header = rows[0].map(norm);
  const col = (...names: string[]) => {
    for (const n of names) {
      const idx = header.indexOf(n);
      if (idx >= 0) return idx;
    }
    return -1;
  };
  const iTitle = col('title', 'titre', 'nom', 'name');
  const iPrice = col('price', 'prix');
  const iImage = col('image', 'image_url', 'photo', 'img');
  const iCat = col('category', 'categorie', 'catégorie');
  const iUrl = col('url', 'lien', 'source_url', 'link');

  let created = 0;
  const errors: string[] = [];
  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r];
    const title = (iTitle >= 0 ? cells[iTitle] : '')?.trim();
    if (!title) { errors.push(`ligne ${r + 1}: titre manquant`); continue; }
    const price = iPrice >= 0 ? cells[iPrice]?.trim() : '';
    const image = iImage >= 0 ? cells[iImage]?.trim() : '';
    const category = iCat >= 0 ? cells[iCat]?.trim() : '';
    const url = iUrl >= 0 ? cells[iUrl]?.trim() : '';
    const product: ProductCardData = {
      id: `csv-${id}-${r}`,
      title: title.slice(0, 140),
      image_url: image && /^https?:\/\//.test(image) ? image : null,
      price_label: price || null,
      currency: null,
      source: (boutique.name || 'Boutique') as ProductCardData['source'],
      source_url: url && /^https?:\/\//.test(url) ? url : '',
      condition: null,
    };
    try {
      createDirectCard(me.id, {
        type: 'image',
        media_url: null,
        caption: title.slice(0, 80),
        attached_product_json: JSON.stringify(product),
        boutique_id: id,
        category: category || null,
      });
      created++;
    } catch (e) {
      errors.push(`ligne ${r + 1}: ${e instanceof Error ? e.message : 'erreur'}`);
    }
  }

  return NextResponse.json({ ok: true, created, errors: errors.slice(0, 20) });
}
