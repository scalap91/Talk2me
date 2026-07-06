/**
 * Console ADMIN — intégrations marketplaces (SHEIN, TEMU). Super-admin only.
 * GET  → statut de chaque connecteur (clés configurées ? base/endpoint ; JAMAIS les valeurs secrètes).
 * POST { provider, action:'test', query? } → TESTE réellement l'API (1 requête) → {count, sample, error}.
 * Sert de « docking platform » : preuve que T2M se connecte vraiment aux API partenaires.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { isAdminCapable } from '@/lib/permissions';
import { sheinConfigured, sheinSearch } from '@/lib/shein';
import { temuConfigured, temuSearch } from '@/lib/temu';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function gate(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me || !isAdminCapable(me.id, me.email)) return null;
  return me;
}

export async function GET(req: NextRequest) {
  if (!gate(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  return NextResponse.json({
    ok: true,
    providers: [
      { key: 'shein', label: 'SHEIN', configured: sheinConfigured(), base: process.env.SHEIN_OPEN_BASE || 'https://open.sheincorp.com', path: process.env.SHEIN_SEARCH_PATH || '/open-api/goods/search', portal: 'https://open.sheincorp.com' },
      { key: 'temu', label: 'TEMU', configured: temuConfigured(), base: process.env.TEMU_BASE || 'https://openapi-b-eu.temu.com', path: '/openapi/router', portal: 'https://partner.temu.com' },
    ],
  });
}

export async function POST(req: NextRequest) {
  if (!gate(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const b = await req.json().catch(() => ({} as Record<string, unknown>));
  const provider = b.provider === 'temu' ? 'temu' : b.provider === 'shein' ? 'shein' : null;
  const query = (typeof b.query === 'string' && b.query.trim()) ? b.query.trim() : 'robe';
  if (!provider) return NextResponse.json({ error: 'bad_provider' }, { status: 400 });

  const configured = provider === 'shein' ? sheinConfigured() : temuConfigured();
  if (!configured) return NextResponse.json({ ok: false, error: 'not_configured', tested_at: Date.now() });

  try {
    const list = provider === 'shein' ? await sheinSearch(query, 3) : await temuSearch(query, 3);
    return NextResponse.json({
      ok: true, count: list.length, tested_at: Date.now(),
      sample: list.slice(0, 3).map((p) => ({ title: p.title, image_url: p.image_url, price_label: p.price_label })),
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message || 'test_failed', tested_at: Date.now() });
  }
}
