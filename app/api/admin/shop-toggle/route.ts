/**
 * Talk2Me — Super-Admin : switch des sous-sections du Shop (Pascal 2026-06-21).
 * GET  → { sections: { eat, annonces, boutique } }.
 * POST { section, enabled } → applique (super-admin only). L'icône Shop reste toujours.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { isAiOpsAdmin } from '@/lib/ai-ops/auth';
import { shopSectionsState, setShopSectionEnabled, type ShopSection } from '@/lib/app-settings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VALID: ShopSection[] = ['eat', 'annonces', 'boutique', 'service', 'emploi', 'location', 'immobilier'];

export async function GET(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me || !isAiOpsAdmin(me.id, me.email)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  return NextResponse.json({ ok: true, sections: shopSectionsState() });
}

export async function POST(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me || !isAiOpsAdmin(me.id, me.email)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  let b: { section?: string; enabled?: boolean } = {};
  try { b = await req.json(); } catch { return NextResponse.json({ error: 'bad_body' }, { status: 400 }); }
  if (!b.section || !VALID.includes(b.section as ShopSection)) return NextResponse.json({ error: 'bad_section' }, { status: 400 });
  setShopSectionEnabled(b.section as ShopSection, !!b.enabled);
  return NextResponse.json({ ok: true, sections: shopSectionsState() });
}
