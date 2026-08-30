/**
 * Talk2Me — Référent d'une fiche (Module 5). Souveraineté OPÉRATEUR : seul le PROPRIÉTAIRE
 * de la fiche pose/change/retire son référent, ou la DONNE à un client. Fiche = boutique OU
 * annonce/véhicule (id générique). Le pointeur référent est porté par le `.card` (rafraîchi ici).
 *  GET  ?shop_id=  → { referent, apporteur }   (proprio uniquement)
 *  GET  ?mine=1    → { clients }                (les fiches que JE sers)
 *  POST { shop_id, action:'set'|'remove'|'give', referent_id?, client_id? }  (proprio uniquement)
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { getSimpleShop, transferShopOwnership, refreshShopCard } from '@/lib/simple-shop';
import { getAnnonceForReserve, transferAnnonceOwnership, refreshAnnonceCard } from '@/lib/annonces-deposit';
import { getDb, getUserById } from '@/lib/db';
import { getReferent, getApporteur, setApporteur, setReferent, removeReferent, listClientsOf, inviteReferent, getPendingReferent, getPendingInvite, acceptReferent, declineReferent, type ReferentLink } from '@/lib/referents';
import { sendPushToUser } from '@/lib/push';
import { logContribution } from '@/lib/network';
import { createNotif } from '@/lib/notifs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type FicheType = 'shop' | 'annonce';
/** Résout une fiche par id (boutique d'abord, puis annonce/véhicule). */
function resolveFiche(id: string): { ownerId: string; name: string; kind: string; type: FicheType } | null {
  const s = getSimpleShop(id) as { owner_id?: string; name?: string; kind?: string } | null;
  if (s && s.owner_id) return { ownerId: s.owner_id, name: s.name || 'Fiche', kind: s.kind || 'boutique', type: 'shop' };
  const a = getAnnonceForReserve(id);
  if (a) return { ownerId: a.owner_id, name: a.title || 'Annonce', kind: 'annonce', type: 'annonce' };
  return null;
}

/** Enrichit un lien référent avec le nom + avatar de la personne (pour l'affichage). */
function withUser(link: ReferentLink | null): (ReferentLink & { name: string; avatar: string | null }) | null {
  if (!link) return null;
  const u = getDb().prepare('SELECT COALESCE(display_name, username) AS name, avatar_url FROM users WHERE id = ?').get(link.referent_id) as { name: string | null; avatar_url: string | null } | undefined;
  return { ...link, name: u?.name || 'Contributeur', avatar: u?.avatar_url || null };
}

/** Nom + avatar d'un user, pour les notifs. */
function actorOf(id: string): { who: string; avatar: string | null } {
  const u = getDb().prepare('SELECT COALESCE(display_name, username) AS name, avatar_url FROM users WHERE id = ?').get(id) as { name: string | null; avatar_url: string | null } | undefined;
  return { who: u?.name || 'Quelqu\'un', avatar: u?.avatar_url || null };
}

export async function GET(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (req.nextUrl.searchParams.get('mine') === '1') {
    return NextResponse.json({ ok: true, clients: listClientsOf(me.id) });
  }
  const shopId = req.nextUrl.searchParams.get('shop_id') || '';
  if (!shopId) return NextResponse.json({ error: 'shop_id_required' }, { status: 400 });
  const f = resolveFiche(shopId);
  if (!f || f.ownerId !== me.id) return NextResponse.json({ error: 'not_owner' }, { status: 403 });
  return NextResponse.json({ ok: true, referent: withUser(getReferent(shopId)), pending: withUser(getPendingReferent(shopId)), apporteur: withUser(getApporteur(shopId)) });
}

export async function POST(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  let b: { shop_id?: string; action?: string; referent_id?: string; client_id?: string; reason?: string } = {};
  try { b = await req.json(); } catch { return NextResponse.json({ error: 'bad_body' }, { status: 400 }); }
  const shopId = String(b.shop_id || '');
  if (!shopId) return NextResponse.json({ error: 'shop_id_required' }, { status: 400 });
  const f = resolveFiche(shopId);
  if (!f) return NextResponse.json({ error: 'fiche_not_found' }, { status: 404 });

  // ACCEPTER / DÉCLINER : action du RÉFÉRENT INVITÉ lui-même (pas le propriétaire).
  if (b.action === 'accept' || b.action === 'decline') {
    if (!getPendingInvite(shopId, me.id)) return NextResponse.json({ error: 'no_invite' }, { status: 404 });
    const meA = actorOf(me.id);
    if (b.action === 'decline') {
      declineReferent(shopId, me.id);
      try { createNotif(f.ownerId, 'referent_declined', 'Référent décliné', `${meA.who} a décliné d'être référent de « ${f.name} ».`, null, me.id, meA.avatar); } catch { /* */ }
      return NextResponse.json({ ok: true, accepted: false });
    }
    const r = acceptReferent(shopId, me.id);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
    await (f.type === 'annonce' ? refreshAnnonceCard(shopId) : refreshShopCard(shopId)); // référent actif → .card à jour
    const code = (f.kind === 'eat' || f.kind === 'plat_maison') ? 'resto_referent' : (f.kind === 'service' || f.kind === 'emploi' || f.kind === 'annonce') ? 'annonce_referent' : 'boutique_referent';
    try { logContribution(me.id, code, { targetId: shopId, targetLabel: f.name }); } catch { /* points best-effort */ }
    try { createNotif(f.ownerId, 'referent_accepted', 'Référent confirmé', `${meA.who} a accepté d'être ton référent sur « ${f.name} ».`, null, me.id, meA.avatar); } catch { /* */ }
    return NextResponse.json({ ok: true, accepted: true });
  }

  // SOUVERAINETÉ : poser / retirer / donner sont réservés au PROPRIÉTAIRE de la fiche.
  if (f.ownerId !== me.id) return NextResponse.json({ error: 'not_owner' }, { status: 403 });

  if (b.action === 'remove') {
    const r = removeReferent(shopId, me.id, b.reason);
    if (r.ok) await (f.type === 'annonce' ? refreshAnnonceCard(shopId) : refreshShopCard(shopId)); // pointeur référent porté par le .card
    return r.ok ? NextResponse.json({ ok: true, referent: null }) : NextResponse.json({ error: r.error }, { status: 400 });
  }

  if (b.action === 'set') {
    const referentId = String(b.referent_id || '');
    if (!referentId) return NextResponse.json({ error: 'referent_id_required' }, { status: 400 });
    if (referentId === me.id) return NextResponse.json({ error: 'cannot_be_own_referent' }, { status: 400 }); // le référent sert un AUTRE
    // PROPOSITION (pending) : le rôle ne s'active qu'à l'acceptation du référent. Points crédités à l'accept.
    const r = inviteReferent(shopId, referentId, me.id);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
    // Notifier le référent invité (push + trace onglet) avec Accepter / Décliner dans la notif.
    const meA = actorOf(me.id);
    const shop = getSimpleShop(shopId) as { public_key?: string } | null;
    const link = `${shop?.public_key ? `/b/${shop.public_key}` : '/notifications'}?invite=${shopId}`;
    try {
      await sendPushToUser(referentId, {
        title: 'Proposition de référent',
        body: `${meA.who} te propose d'être référent de « ${f.name} ». Acceptes-tu ?`,
        url: link, type: 'referent_invite', actorId: me.id, actorAvatar: meA.avatar,
      });
    } catch { /* best-effort */ }
    return NextResponse.json({ ok: true, pending: withUser(getPendingReferent(shopId)) });
  }

  if (b.action === 'give') {
    const clientId = String(b.client_id || '').trim();
    if (!clientId || clientId === me.id) return NextResponse.json({ error: 'invalid_client' }, { status: 400 });
    const client = getUserById(clientId);
    if (!client) return NextResponse.json({ error: 'client_not_found' }, { status: 404 });
    const r = f.type === 'annonce'
      ? transferAnnonceOwnership(shopId, me.id, clientId)
      : transferShopOwnership(shopId, me.id, clientId);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
    // Le donneur reste apporteur + référent → garde l'accès jusqu'à ce que le client le retire.
    try { setApporteur(shopId, me.id); } catch { /* déjà apporteur */ }
    try { setReferent(shopId, me.id, clientId, 'don au client'); } catch { /* */ }
    await (f.type === 'annonce' ? refreshAnnonceCard(shopId) : refreshShopCard(shopId)); // owner + référent changés → .card à jour
    try { logContribution(me.id, 'client_onboard', { targetId: shopId, targetLabel: f.name }); } catch { /* points best-effort */ }
    try {
      const meU = getUserById(me.id) as { display_name?: string; username?: string } | null;
      const who = meU?.display_name || meU?.username || 'Un contributeur';
      createNotif(clientId, 'shop_received', 'Une fiche t\'a été confiée',
        `${who} t'a donné « ${f.name} ». Elle est à toi — tu peux la gérer, et retirer ton référent quand tu veux.`);
    } catch { /* best-effort */ }
    const cu = client as { display_name?: string; username?: string };
    return NextResponse.json({ ok: true, client: { id: clientId, name: cu.display_name || cu.username || 'Client' } });
  }

  return NextResponse.json({ error: 'bad_action' }, { status: 400 });
}
