/**
 * Talk2Me — Circuit de litige (Pascal 2026-07-27). Séparation des pouvoirs :
 *  POST action:'open'     { subject_id, reason, escrow_id? }        → une partie ouvre un litige.
 *  POST action:'instruct' { litige_id, report }                     → LE CHEF (rang≥3 ou gouvernance) instruit (rapport signé).
 *  POST action:'decide'   { litige_id, refund_type, sanction_level?, note } → LE VALIDATEUR décide (neutre). Sanction=record ; remboursement NON exécuté (gaté).
 *  GET → { open:[à instruire si chef], instructed:[à trancher si validateur] } enrichis des noms.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { hasPermission } from '@/lib/permissions';
import { isAiOpsAdmin } from '@/lib/ai-ops/auth';
import { getDb } from '@/lib/db';
import { getContributor } from '@/lib/network';
import { openLitige, instructLitige, decideLitige, listOpen, listInstructed, type Litige, type RefundType } from '@/lib/litige';
// DOSSIER du chef (Étape 3b, Pascal 2026-08-06) : il instruit SUR PIÈCES, plus à l'aveugle.
import { getEscrow } from '@/lib/escrow';
import { getArticleDotcardsByIds } from '@/lib/simple-shop';
import { getShipmentIdByEscrow, getShipment } from '@/lib/shipment';
import { getCasier } from '@/lib/casier';
// 3c — FIL MÉDIÉ (Pascal 2026-08-06) : le chef parle aux 2 parties SÉPARÉMENT (jamais acheteur↔vendeur direct).
import { createCommerceConversation } from '@/lib/db';
import { getLitige } from '@/lib/litige';

/** Assemble le dossier factuel d'un litige : commande (.card + escrow) + colis (statut + events) +
 *  casier du vendeur. Best-effort — un dossier partiel vaut mieux qu'une instruction aveugle. */
function buildDossier(l: Litige) {
  const d: { order?: unknown; shipment?: unknown; casier?: unknown } = {};
  try {
    if (l.escrow_id) {
      const e = getEscrow(l.escrow_id);
      if (e) {
        let card: { title?: string; images?: string[] } | null = null;
        if (e.card_id && !e.card_id.startsWith('cart:')) {
          const dc = getArticleDotcardsByIds([e.card_id])[0]?.dotcard;
          if (dc) { try { const c = JSON.parse(dc) as { title?: string; images?: string[] }; card = { title: c.title, images: c.images }; } catch { /* */ } }
        }
        d.order = { title: card?.title || null, image: card?.images?.[0] || null, amount_cents: e.amount_cents, currency: e.currency, escrow_status: e.status, order_type: e.order_type };
      }
      const shipId = getShipmentIdByEscrow(l.escrow_id);
      if (shipId) {
        const sh = getShipment(shipId);
        const evts = getDb().prepare('SELECT type, created_at FROM shipment_events WHERE shipment_id=? ORDER BY created_at ASC').all(shipId) as Array<{ type: string; created_at: number }>;
        d.shipment = sh ? { status: sh.status, tracking: sh.tracking, events: evts.map((ev) => ({ type: ev.type, at: ev.created_at })) } : null;
      }
    }
    const c = getCasier(l.subject_id);
    d.casier = { litiges: c.litiges, refunds: c.refunds, reports: c.reports, health: c.health, score: c.score };
  } catch { /* dossier best-effort */ }
  return d;
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function isValidateur(me: { id: string; email?: string | null }): boolean {
  return isAiOpsAdmin(me.id, me.email) || hasPermission(me.id, me.email || '', 'curation_validateur');
}
function isChef(me: { id: string; email?: string | null }): boolean {
  if (isValidateur(me)) return true; // le staff/validateur peut aussi instruire (hors le juge-et-partie, bloqué au moteur)
  try { const c = getContributor(me.id); return !!c && c.level_rank >= 3; } catch { return false; }
}
const nameOf = (id: string | null): string => {
  if (!id) return '—';
  try { const u = getDb().prepare('SELECT display_name, username FROM users WHERE id = ?').get(id) as { display_name?: string; username?: string } | undefined; return (u?.display_name || u?.username || 'Utilisateur'); } catch { return 'Utilisateur'; }
};
const enrich = (l: Litige) => ({ ...l, subject_name: nameOf(l.subject_id), opener_name: nameOf(l.opened_by), chef_name: nameOf(l.chef_id) });

export async function GET(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const chef = isChef(me), val = isValidateur(me);
  if (!chef && !val) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  return NextResponse.json({ ok: true, is_chef: chef, is_validateur: val, open: chef ? listOpen().map((l) => ({ ...enrich(l), dossier: buildDossier(l) })) : [], instructed: val ? listInstructed().map((l) => ({ ...enrich(l), dossier: buildDossier(l) })) : [] });
}

export async function POST(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  let b: { action?: string; subject_id?: string; reason?: string; escrow_id?: string | null; litige_id?: string; report?: string; refund_type?: string; sanction_level?: number | null; note?: string } = {};
  try { b = await req.json(); } catch { return NextResponse.json({ error: 'bad_body' }, { status: 400 }); }

  if (b.action === 'open') {
    const r = openLitige(me.id, String(b.subject_id || ''), String(b.reason || ''), b.escrow_id ?? null);
    return r.ok ? NextResponse.json({ ok: true, id: r.id }) : NextResponse.json({ error: r.error }, { status: 400 });
  }
  if (b.action === 'instruct') {
    if (!isChef(me)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    const r = instructLitige(String(b.litige_id || ''), me.id, String(b.report || ''));
    return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.error, message: r.error === 'juge_et_partie' ? 'Tu ne peux pas instruire un litige qui te vise ou que tu as ouvert.' : undefined }, { status: 400 });
  }
  if (b.action === 'decide') {
    if (!isValidateur(me)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    const rt = (['none', 'partial', 'full'].includes(String(b.refund_type)) ? b.refund_type : 'none') as RefundType;
    const r = decideLitige(String(b.litige_id || ''), me.id, rt, { sanctionLevel: b.sanction_level ?? null, note: b.note });
    if (!r.ok) return NextResponse.json({ error: r.error, message: r.error === 'juge_et_partie' ? 'Un validateur ne tranche pas un litige qu’il a instruit ou qui le vise.' : undefined }, { status: 400 });
    const MONEY_MSG: Record<string, string> = { refunded: 'Remboursé à l’acheteur ✓', released: 'Fonds libérés au vendeur ✓', already_settled: 'Escrow déjà réglé — argent inchangé', pending: 'Partiel : montant à préciser (non versé)', no_escrow: 'Pas d’escrow rattaché', error: 'Mouvement d’argent en échec' };
    return NextResponse.json({ ok: true, money: r.money, note: `Décision signée. ${MONEY_MSG[r.money || 'no_escrow']}` });
  }
  // 3c — le chef ouvre un fil médié avec UNE partie (acheteur ou vendeur). Jamais les 2 ensemble.
  if (b.action === 'contact') {
    if (!isChef(me)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    const l = getLitige(String(b.litige_id || ''));
    if (!l) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    if (l.opened_by === me.id || l.subject_id === me.id) return NextResponse.json({ error: 'juge_et_partie', message: 'Tu ne peux pas arbitrer un litige qui te vise ou que tu as ouvert.' }, { status: 400 });
    const partyId = b.party === 'seller' ? l.subject_id : l.opened_by;
    if (!partyId) return NextResponse.json({ error: 'no_party' }, { status: 400 });
    const conv = createCommerceConversation(me.id, partyId);
    return NextResponse.json({ ok: true, conv_id: conv.id });
  }
  return NextResponse.json({ error: 'bad_action' }, { status: 400 });
}
