/**
 * Talk2Me — Référent d'une fiche (Module 5, Phase 1). Souveraineté OPÉRATEUR : seul le
 * PROPRIÉTAIRE de la fiche pose/change/retire son référent. Zéro argent ici.
 *  GET  ?shop_id=  → { referent, apporteur }  (proprio de la fiche uniquement)
 *  GET  ?mine=1    → { clients }               (les fiches que JE sers)
 *  POST { shop_id, action:'set'|'remove', referent_id? }  (proprio uniquement)
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { getSimpleShop } from '@/lib/simple-shop';
import { getDb } from '@/lib/db';
import { getReferent, getApporteur, setReferent, removeReferent, listClientsOf, type ReferentLink } from '@/lib/referents';
import { logContribution } from '@/lib/network';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function ownsShop(shopId: string, userId: string): boolean {
  const s = getSimpleShop(shopId) as { owner_id?: string } | null;
  return !!s && s.owner_id === userId;
}

/** Enrichit un lien référent avec le nom + avatar de la personne (pour l'affichage). */
function withUser(link: ReferentLink | null): (ReferentLink & { name: string; avatar: string | null }) | null {
  if (!link) return null;
  const u = getDb().prepare('SELECT COALESCE(display_name, username) AS name, avatar_url FROM users WHERE id = ?').get(link.referent_id) as { name: string | null; avatar_url: string | null } | undefined;
  return { ...link, name: u?.name || 'Contributeur', avatar: u?.avatar_url || null };
}

export async function GET(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (req.nextUrl.searchParams.get('mine') === '1') {
    return NextResponse.json({ ok: true, clients: listClientsOf(me.id) });
  }
  const shopId = req.nextUrl.searchParams.get('shop_id') || '';
  if (!shopId) return NextResponse.json({ error: 'shop_id_required' }, { status: 400 });
  if (!ownsShop(shopId, me.id)) return NextResponse.json({ error: 'not_owner' }, { status: 403 });
  return NextResponse.json({ ok: true, referent: withUser(getReferent(shopId)), apporteur: withUser(getApporteur(shopId)) });
}

export async function POST(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  let b: { shop_id?: string; action?: string; referent_id?: string; reason?: string } = {};
  try { b = await req.json(); } catch { return NextResponse.json({ error: 'bad_body' }, { status: 400 }); }
  const shopId = String(b.shop_id || '');
  if (!shopId) return NextResponse.json({ error: 'shop_id_required' }, { status: 400 });
  // SOUVERAINETÉ : seul le propriétaire de la fiche décide de son référent.
  if (!ownsShop(shopId, me.id)) return NextResponse.json({ error: 'not_owner' }, { status: 403 });

  if (b.action === 'remove') {
    const r = removeReferent(shopId, me.id, b.reason);
    return r.ok ? NextResponse.json({ ok: true, referent: null }) : NextResponse.json({ error: r.error }, { status: 400 });
  }
  if (b.action === 'set') {
    const referentId = String(b.referent_id || '');
    if (!referentId) return NextResponse.json({ error: 'referent_id_required' }, { status: 400 });
    if (referentId === me.id) return NextResponse.json({ error: 'cannot_be_own_referent' }, { status: 400 }); // le référent sert un AUTRE
    const wasSame = getReferent(shopId)?.referent_id === referentId;
    const r = setReferent(shopId, referentId, me.id, b.reason);
    // Points méritocratie « devenir référent » (par kind), une seule fois — pas de re-crédit si déjà lui.
    if (r.ok && !wasSame) {
      const s = getSimpleShop(shopId);
      const kind = s?.kind || 'boutique';
      const code = (kind === 'eat' || kind === 'plat_maison') ? 'resto_referent' : (kind === 'service' || kind === 'emploi' || kind === 'annonce') ? 'annonce_referent' : 'boutique_referent';
      try { logContribution(referentId, code, { targetId: shopId, targetLabel: s?.name || 'Fiche' }); } catch { /* points best-effort */ }
    }
    return r.ok ? NextResponse.json({ ok: true, referent: withUser(getReferent(shopId)), changed: r.changed }) : NextResponse.json({ error: r.error }, { status: 400 });
  }
  return NextResponse.json({ error: 'bad_action' }, { status: 400 });
}
