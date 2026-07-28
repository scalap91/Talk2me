/**
 * Rattachement chauffeurs ↔ agence.
 * GET  → { drivers: [mes chauffeurs (agence)], requests: [mes demandes à valider (chauffeur)] }
 * POST → { action:'attach', phone }        (agence attache un chauffeur par téléphone)
 *        { action:'respond', id, accept }   (chauffeur valide/refuse)
 *        { action:'detach', driver_id }      (agence retire un chauffeur)
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { attachDriverByPhone, attachDriver, respondAttachment, detachDriver, listAgencyDrivers, listMyAttachRequests } from '@/lib/agency-drivers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  return NextResponse.json({ ok: true, drivers: listAgencyDrivers(me.id), requests: listMyAttachRequests(me.id) });
}

export async function POST(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  let b: { action?: string; phone?: string; id?: string; accept?: boolean; driver_id?: string } = {};
  try { b = await req.json(); } catch { return NextResponse.json({ error: 'bad_body' }, { status: 400 }); }
  let r: { ok: boolean; error?: string; driver?: { id: string; name: string } };
  switch (b.action) {
    // attach par ID (sélection dans la recherche) prioritaire ; sinon fallback téléphone.
    case 'attach': r = b.driver_id ? attachDriver(me.id, String(b.driver_id)) : attachDriverByPhone(me.id, String(b.phone || '')); break;
    case 'respond': r = respondAttachment(me.id, String(b.id || ''), b.accept === true); break;
    case 'detach': r = detachDriver(me.id, String(b.driver_id || '')); break;
    default: return NextResponse.json({ error: 'bad_action' }, { status: 400 });
  }
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
  return NextResponse.json({ ok: true, driver: r.driver, drivers: listAgencyDrivers(me.id), requests: listMyAttachRequests(me.id) });
}
