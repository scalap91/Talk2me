import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { getKyc } from '@/lib/kyc';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * État KYC de l'utilisateur courant — le client s'en sert pour GRISER la partie business
 * (vendre, encaisser, boutique) tant que la CIN n'est pas vérifiée (Pascal 2026-09-03).
 */
export async function GET(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const k = getKyc(me.id);
  return NextResponse.json({
    ok: true,
    status: k.status,               // none | pending | verified | rejected
    can_do_business: k.can_do_business,
    full_name: k.full_name,
    sim_attested: k.sim_attested,
  });
}
