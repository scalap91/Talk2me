/**
 * Talk2Me — ADMIN : gestion des fiches Eat « à revendiquer ».
 * GET ?status=  → liste (+ compteurs). POST {action:'delete', osm_id} → efface
 * (jamais automatique : seul un admin efface à la main). Gardé par isAiOpsAdmin.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { hasPermission } from '@/lib/permissions';
import { listAllListings, countByStatus, deleteListing } from '@/lib/eat-listings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me || !hasPermission(me.id, me.email, 'eat')) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const status = req.nextUrl.searchParams.get('status') || undefined;
  return NextResponse.json({ ok: true, counts: countByStatus(), listings: listAllListings(status) });
}

export async function POST(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me || !hasPermission(me.id, me.email, 'eat')) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  let b: { action?: string; osm_id?: string } = {};
  try { b = await req.json(); } catch { return NextResponse.json({ error: 'bad_body' }, { status: 400 }); }
  if (b.action === 'delete' && b.osm_id) {
    return NextResponse.json({ ok: deleteListing(b.osm_id) });
  }
  return NextResponse.json({ error: 'unknown_action' }, { status: 400 });
}
