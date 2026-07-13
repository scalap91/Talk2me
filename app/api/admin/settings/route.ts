/**
 * GET/POST /api/admin/settings (Pascal 2026-07-09) — RÉGLAGES OPÉRATIONNELS admin.
 * « Toutes ces variables doivent être dans l'admin » : rayons (plats de Mama), seuils capacité…
 * GET → { settings, specs }. POST { key, value } → fixe (borné selon le registre OPS_SETTINGS).
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { isAdminCapable } from '@/lib/permissions';
import { allOps, setOps, OPS_SETTINGS } from '@/lib/app-settings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function admin(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  return me && isAdminCapable(me.id, me.email) ? me : null;
}

export async function GET(req: NextRequest) {
  if (!admin(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  return NextResponse.json({ ok: true, settings: allOps(), specs: OPS_SETTINGS });
}

export async function POST(req: NextRequest) {
  if (!admin(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  let body: { key?: string; value?: number } = {};
  try { body = await req.json(); } catch { /* */ }
  if (!body.key || !(body.key in OPS_SETTINGS)) return NextResponse.json({ error: 'bad_key' }, { status: 400 });
  if (!Number.isFinite(Number(body.value))) return NextResponse.json({ error: 'bad_value' }, { status: 400 });
  setOps(body.key, Number(body.value));
  return NextResponse.json({ ok: true, settings: allOps() });
}
