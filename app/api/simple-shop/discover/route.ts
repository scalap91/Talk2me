/**
 * GET /api/simple-shop/discover?q= — élargissement de la Recherche (/decouvrir) aux familles
 * commerce qui ne sont PAS dans l'index de cards : ANNONCES (articles badgés annonce) et EAT
 * (restos + plats maison). Pascal 2026-08-30.
 *
 * Réutilise les fonctions de liste existantes + filtre `q` en mémoire (volumes faibles, zéro
 * SQL neuf). Respecte les interrupteurs de section (« OFF → coupé partout »). PII air-gap :
 * on n'expose que les champs publics de la fiche (id, titre, sous-titre, image, lien /b/<key>).
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { isShopSectionEnabled } from '@/lib/app-settings';
import { getPublishedAnnonces } from '@/lib/annonces-deposit';
import { listAllShopsByKind } from '@/lib/simple-shop';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Hit { id: string; title: string; subtitle: string | null; image: string | null; href: string | null }

export async function GET(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const q = (req.nextUrl.searchParams.get('q') || '').trim().toLowerCase();
  const match = (s: string) => !q || s.toLowerCase().includes(q);

  // ── ANNONCES (annonces déposées + articles de boutique badgés « annonce ») ──
  let annonces: Hit[] = [];
  if (isShopSectionEnabled('annonces')) {
    try {
      annonces = getPublishedAnnonces()
        .filter((a) => match(`${a.title} ${a.category} ${a.city || ''}`))
        .slice(0, 24)
        .map((a) => ({
          id: a.id,
          title: a.title,
          subtitle: [a.category, a.city, a.price_label].filter(Boolean).join(' · ') || null,
          image: a.image_url,
          href: a.shop_key ? `/b/${a.shop_key}` : '/annonces',
        }));
    } catch { annonces = []; }
  }

  // ── EAT (restaurants + plats maison) ──
  let eat: Hit[] = [];
  if (isShopSectionEnabled('eat')) {
    try {
      const shops = [...listAllShopsByKind('eat'), ...listAllShopsByKind('plat_maison')];
      eat = shops
        .filter((s) => match(`${s.name} ${s.description || ''} ${s.category || ''}`))
        .slice(0, 24)
        .map((s) => ({
          id: s.id,
          title: s.name,
          subtitle: s.description || s.category || null,
          image: s.cover_url,
          href: s.public_key ? `/b/${s.public_key}` : `/ma-boutique/${s.id}`,
        }));
    } catch { eat = []; }
  }

  return NextResponse.json({ ok: true, annonces, eat });
}
