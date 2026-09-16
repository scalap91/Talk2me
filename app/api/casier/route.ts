/**
 * Talk2Me — Casier de résultats (Pascal 2026-07-27). GET → MON casier. GET ?user_id= → le casier
 * d'AUTRUI, réservé à la GOUVERNANCE (staff/validateur) : la data qui juge sur les faits, jamais
 * commissionné. Doctrine : [[project_talk2me_gouvernance_anticorruption]].
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { hasPermission } from '@/lib/permissions';
import { isAiOpsAdmin } from '@/lib/ai-ops/auth';
import { getCasier } from '@/lib/casier';
import { hasInstructedLitigeAbout } from '@/lib/litige';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const uid = req.nextUrl.searchParams.get('user_id');
  if (uid && uid !== me.id) {
    // Le casier d'autrui = gouvernance neutre. Chef = JAMAIS. Validateur = SEULEMENT si un chef a
    // fait monter (instruit) un différend sur cette personne — pas de consultation libre. Staff (racine) = partout.
    const isStaff = isAiOpsAdmin(me.id, me.email);
    const isVal = hasPermission(me.id, me.email || '', 'curation_validateur');
    if (!isStaff && !isVal) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    if (isVal && !isStaff && !hasInstructedLitigeAbout(uid)) {
      return NextResponse.json({ error: 'forbidden', message: "Casier consultable seulement quand un chef a fait monter un différend sur cette personne." }, { status: 403 });
    }
    return NextResponse.json({ ok: true, user_id: uid, casier: getCasier(uid) });
  }
  return NextResponse.json({ ok: true, user_id: me.id, casier: getCasier(me.id) });
}
