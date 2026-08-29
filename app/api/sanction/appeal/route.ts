/**
 * /api/sanction/appeal — CONTESTER SA SANCTION (Pascal 2026-08-29, Branchement 2).
 *   GET  → { ok, sanction, appeal } : ta sanction active + un recours déjà en cours (le cas échéant).
 *   POST { reason } → ouvre un recours (litige SANS escrow, porte la sanction_id). Le chef INSTRUIT,
 *                     le validateur TRANCHE (lever/maintenir). L'app a tranché ; l'humain revoit.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { activeSanction } from '@/lib/sanctions';
import { openLitige, findOpenAppeal } from '@/lib/litige';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const s = activeSanction(me.id);
  const appeal = s ? findOpenAppeal(s.id) : null;
  return NextResponse.json({
    ok: true,
    sanction: s ? { id: s.id, level: s.level, reason: s.reason, created_at: s.created_at } : null,
    appeal: appeal ? { id: appeal.id, status: appeal.status, created_at: appeal.created_at } : null,
  });
}

export async function POST(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const b = await req.json().catch(() => ({} as Record<string, unknown>));
  const reason = (typeof b.reason === 'string' ? b.reason : '').trim();
  if (!reason) return NextResponse.json({ error: 'reason_required', message: 'Explique pourquoi tu contestes.' }, { status: 400 });

  const s = activeSanction(me.id);
  if (!s) return NextResponse.json({ error: 'no_sanction', message: 'Tu n’as aucune sanction active à contester.' }, { status: 400 });
  if (findOpenAppeal(s.id)) return NextResponse.json({ error: 'appeal_exists', message: 'Un recours est déjà en cours pour cette sanction.' }, { status: 409 });

  // Recours = litige SANS escrow, sujet = moi, porte la sanction contestée.
  const r = openLitige(me.id, me.id, `[APPEL SANCTION] ${reason}`, null, s.id);
  return r.ok ? NextResponse.json({ ok: true, id: r.id }) : NextResponse.json({ error: r.error }, { status: 400 });
}
