/**
 * GET  /api/leases — mes baux (bailleur OU locataire) + leurs échéances.
 * POST /api/leases { tenant, monthly, day?, title?, start? } — le BAILLEUR crée un bail
 *      vers un locataire (par @pseudo). Génère les échéances dues jusqu'au mois courant.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { createLease, listLeasesForUser, listDues } from '@/lib/leases';
import { getUserByUsername, getUserById } from '@/lib/db';
import { toMinor } from '@/lib/money';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const leases = listLeasesForUser(me.id).map((l) => {
    const other = l.landlord_id === me.id ? getUserById(l.tenant_id) : getUserById(l.landlord_id);
    return {
      ...l,
      role: l.landlord_id === me.id ? 'landlord' : 'tenant',
      other_name: other ? (other.display_name || other.username) : null,
      dues: listDues(l.id),
    };
  });
  return NextResponse.json({ ok: true, leases });
}

export async function POST(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const b = await req.json().catch(() => ({} as Record<string, unknown>));
  const handle = (typeof b.tenant === 'string' ? b.tenant : '').trim().replace(/^@/, '');
  const monthly = Number(b.monthly);
  if (!handle || !Number.isFinite(monthly) || monthly <= 0) return NextResponse.json({ error: 'bad_params' }, { status: 400 });
  const tenant = getUserByUsername(handle);
  if (!tenant) return NextResponse.json({ error: 'tenant_not_found' }, { status: 404 });
  if (tenant.id === me.id) return NextResponse.json({ error: 'self' }, { status: 400 });

  const lease = createLease(me.id, {
    tenantId: tenant.id,
    title: typeof b.title === 'string' ? b.title : null,
    monthlyCents: toMinor(monthly),
    dayOfMonth: typeof b.day === 'number' ? b.day : parseInt(String(b.day || '1'), 10) || 1,
    startPeriod: typeof b.start === 'string' && /^\d{4}-\d{2}$/.test(b.start) ? b.start : undefined,
  });
  if (!lease) return NextResponse.json({ error: 'create_failed' }, { status: 400 });
  return NextResponse.json({ ok: true, lease });
}
