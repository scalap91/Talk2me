import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { getOwnerStatuses } from '@/lib/status';
import { getSimpleShop, listItems } from '@/lib/simple-shop';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Params { params: Promise<{ ownerId: string }> }

// GET — les statuts d'un propriétaire (viewer plein écran). Résout la boutique
// pour les statuts 'shop' (nom + items).
export async function GET(req: NextRequest, ctx: Params) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { ownerId } = await ctx.params;
  const statuses = getOwnerStatuses(ownerId).map((s) => {
    if (s.kind === 'shop' && s.shop_id) {
      const shop = getSimpleShop(s.shop_id);
      return {
        ...s,
        shop: shop ? { id: shop.id, name: shop.name, public_key: shop.public_key, items: listItems(shop.id) } : null,
      };
    }
    return s;
  });
  return NextResponse.json({ ok: true, statuses });
}
