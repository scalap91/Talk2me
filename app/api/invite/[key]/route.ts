/**
 * GET /api/invite/[key] — aperçu PUBLIC (sans auth) d'une fiche à partager, pour la page
 * d'atterrissage /i/<key>. Fonctionne pour TOUTE fiche simple_shop (boutique/eat/plat_maison/
 * service/emploi/rencontre) — le lien générique de la plateforme = /b/<public_key>. Pascal 2026-08-30.
 * PII air-gap : on n'expose que le nom public, la couverture, le kind et le PSEUDO du propriétaire
 * (déjà public — sert de code de parrainage, cf. /r/<code>).
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSimpleShopByKey } from '@/lib/simple-shop';
import { getUserById } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const KIND_LABEL: Record<string, string> = {
  boutique: 'boutique', eat: 'restaurant', plat_maison: 'cuisine maison',
  service: 'service', emploi: 'offre d’emploi', rencontre: 'profil',
};

export async function GET(_req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const shop = getSimpleShopByKey(String(key || ''));
  if (!shop) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  const owner = getUserById(shop.owner_id) as { username?: string; display_name?: string } | null;
  return NextResponse.json({
    ok: true,
    fiche: {
      key: shop.public_key,
      name: shop.name,
      kind: shop.kind || 'boutique',
      kind_label: KIND_LABEL[shop.kind || 'boutique'] || 'fiche',
      cover: shop.cover_url ?? null,
      owner_username: owner?.username || null,
      owner_name: owner?.display_name || owner?.username || null,
    },
  });
}
