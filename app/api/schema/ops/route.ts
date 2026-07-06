/**
 * GET /api/schema/ops — logs & coûts (DEV ONLY + rôle SENSIBLE). Pascal 2026-06-30.
 * Exécute des commandes système (pm2 jlist, du) → réservé aux rôles à paramètres
 * sensibles (admin / infra / paiement) ou super-admin. Données réelles, fail-soft.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { effectiveCockpitRole } from '@/lib/schema/access';
import { isDevDiag } from '@/lib/schema/diag';
import { getRole } from '@/lib/schema/registry';
import { gatherOps } from '@/lib/schema/ops';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  if (!isDevDiag()) return new NextResponse('Not found', { status: 404 });
  const me = getCurrentUserFromRequest(req);
  const roleKey = effectiveCockpitRole(me);
  const role = roleKey ? getRole(roleKey) : null;
  if (!role || !role.sensitive) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  return NextResponse.json(gatherOps());
}
