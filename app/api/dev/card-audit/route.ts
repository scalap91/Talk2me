/**
 * /api/dev/card-audit — AUDIT STRUCTUREL .card MULTI-SOURCE (Pascal 2026-07-11 « tout est card »).
 *
 * Le pendant « données » du watchdog visuel : déroule TOUTES les sources de contenu (posts,
 * boutique/SHEIN, eat, services, emploi…) et vérifie que CHACUNE est une vraie `.card` = a bien
 * son FICHIER `.card` conforme (un lecteur ne lit QUE des .card). Régression structurelle = un
 * contenu qui n'a pas de fichier .card (il n'existe que dans sa table). Révèle le gap PAR SOURCE.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getRecentCardRows } from '@/lib/db';
import { listAllShopProducts } from '@/lib/db-commerce';
import { listAllListings } from '@/lib/eat-listings';
import { listListings, listAnnonceItems, listAllShopsByKind } from '@/lib/simple-shop';
import { readCardFileRaw } from '@/lib/cards/card-file';
import { parseCard } from '@/lib/cards/supercard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Src = { id: string; source: string };

export async function GET(req: NextRequest) {
  const per = Math.min(parseInt(req.nextUrl.searchParams.get('per') ?? '40', 10) || 40, 120);
  const sources: Src[] = [];
  const add = (arr: unknown[], source: string, idOf: (x: any) => string | undefined) => {
    for (const x of arr.slice(0, per)) { const id = idOf(x); if (id) sources.push({ id, source }); }
  };
  try { for (const r of getRecentCardRows(per)) sources.push({ id: r.id, source: 'post' }); } catch { /* */ }
  try { add(listAllShopProducts(), 'boutique', (x) => x.id); } catch { /* */ }
  try { add(listAllListings(undefined, per), 'eat', (x) => x.osm_id ?? x.id); } catch { /* */ }
  try { add(listListings('service'), 'service', (x) => x.id); } catch { /* */ }
  try { add(listListings('emploi'), 'emploi', (x) => x.id); } catch { /* */ }
  try { add(listAllShopsByKind('plat_maison'), 'plat-maison', (x) => x.id); } catch { /* */ }
  try { add(listAnnonceItems({}), 'annonce', (x) => x.id); } catch { /* */ }

  const results = await Promise.all(
    sources.map(async (s) => {
      const file = await readCardFileRaw(s.id).catch(() => null);
      if (!file) return { ...s, conforme: false, raison: 'pas de fichier .card' };
      const p = parseCard(file);
      if (!p.ok || !p.card) return { ...s, conforme: false, raison: '.card illisible: ' + (p.reason || '?') };
      return { ...s, conforme: true, raison: '' };
    }),
  );

  // Récap PAR SOURCE (conforme/total) — révèle quel type ne produit pas de .card.
  const bySource: Record<string, { total: number; conformes: number }> = {};
  for (const r of results) {
    const b = (bySource[r.source] ||= { total: 0, conformes: 0 });
    b.total++; if (r.conforme) b.conformes++;
  }
  const nonConformes = results.filter((r) => !r.conforme);
  return NextResponse.json({
    ok: true,
    total: results.length,
    conformes: results.length - nonConformes.length,
    par_source: bySource,
    non_conformes: nonConformes.slice(0, 30).map((x) => ({ id: x.id, source: x.source, raison: x.raison })),
  });
}
