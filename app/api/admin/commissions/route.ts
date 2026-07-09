/**
 * GET/POST /api/admin/commissions (Pascal 2026-07-09) — RÉGLAGE ADMIN des taux de commission.
 * GET  → { rates, defaults, labels }. POST { key, rate } → fixe un taux (borné [0,1]).
 * Toutes les commissions (plateforme, part promoteur, PaPi) se règlent ici, plus de constantes en dur.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { isAdminCapable } from '@/lib/permissions';
import { allCommissionRates, setCommissionRate, COMMISSION_DEFAULTS, COMMISSION_LABELS, type CommissionKey } from '@/lib/app-settings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function admin(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  return me && isAdminCapable(me.id, me.email) ? me : null;
}

export async function GET(req: NextRequest) {
  if (!admin(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  return NextResponse.json({ ok: true, rates: allCommissionRates(), defaults: COMMISSION_DEFAULTS, labels: COMMISSION_LABELS });
}

export async function POST(req: NextRequest) {
  if (!admin(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  let body: { key?: string; rate?: number } = {};
  try { body = await req.json(); } catch { /* */ }
  const key = body.key as CommissionKey;
  if (!key || !(key in COMMISSION_DEFAULTS)) return NextResponse.json({ error: 'bad_key' }, { status: 400 });
  const rate = Number(body.rate);
  if (!Number.isFinite(rate) || rate < 0 || rate > 1) return NextResponse.json({ error: 'bad_rate' }, { status: 400 });
  setCommissionRate(key, rate);
  return NextResponse.json({ ok: true, rates: allCommissionRates() });
}
