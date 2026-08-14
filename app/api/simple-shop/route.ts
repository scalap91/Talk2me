import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { createSimpleShop, listSimpleShops, deleteSimpleShop, upsertRencontreProfile, listAttachedShops, getSimpleShop } from '@/lib/simple-shop';
import { getVitrineCard } from '@/lib/db-direct-cards';
import { getUserById } from '@/lib/db';
import { isShopSectionEnabled, type ShopSection } from '@/lib/app-settings';

// « Section OFF → coupé PARTOUT » : chaque kind de fiche dépend de son interrupteur. service/emploi
// = famille annonce → `annonces` ; plat_maison/eat → `eat` ; boutique → `boutique` ; rencontre → `rencontre`.
const KIND_SECTION: Record<'boutique' | 'eat' | 'plat_maison' | 'service' | 'emploi' | 'rencontre', ShopSection> = {
  boutique: 'boutique', eat: 'eat', plat_maison: 'eat', service: 'annonces', emploi: 'annonces', rencontre: 'rencontre',
};

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST { name } → crée une petite boutique (perso, photos+prix). GET → liste.
export async function POST(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  let body: { name?: string; description?: string; category?: string; kind?: 'boutique' | 'eat' | 'plat_maison' | 'service' | 'emploi' | 'rencontre'; coverUrl?: string; lat?: number; lng?: number; prepMin?: number; address?: string; phone?: string; hours?: string; serviceMode?: string; deliveryFeeCents?: number; minOrderCents?: number } = {};
  try { body = await req.json(); } catch { /* defaults */ }
  const kind = body.kind === 'eat' ? 'eat' : body.kind === 'plat_maison' ? 'plat_maison' : body.kind === 'service' ? 'service' : body.kind === 'emploi' ? 'emploi' : body.kind === 'rencontre' ? 'rencontre' : 'boutique';
  // Section coupée → création bloquée côté serveur (accès direct à /mes-boutiques, /mes-services… inclus).
  if (!isShopSectionEnabled(KIND_SECTION[kind])) return NextResponse.json({ error: 'section_disabled' }, { status: 403 });
  // RENCONTRE (Pascal 2026-07-14) : pas de nom re-saisi → on prend le nom du PROFIL déjà complet
  // (l'appli l'exige pour Drive/boutique…). Évite les faux profils. Le prénom est authoritatif serveur.
  const meNamed = me as { display_name?: string | null; username?: string | null };
  const defaultName = kind === 'eat' ? 'Mon resto' : kind === 'rencontre' ? (meNamed.display_name || meNamed.username || 'Profil') : 'Ma boutique';
  // RENCONTRE = 1 SEUL profil par compte → upsert (met à jour si déjà créé). Pascal 2026-07-14.
  if (kind === 'rencontre') {
    const shop = upsertRencontreProfile(me.id, {
      name: (body.name || '').trim() || defaultName,
      description: body.description,
      age: body.serviceMode,
      ville: body.address,
      coverUrl: body.coverUrl,
    });
    return NextResponse.json({ ok: true, shop });
  }
  const shop = createSimpleShop(
    me.id,
    body.name || defaultName,
    body.description,
    body.category,
    kind,
    {
      coverUrl: body.coverUrl || null,
      lat: typeof body.lat === 'number' ? body.lat : null,
      lng: typeof body.lng === 'number' ? body.lng : null,
      prepMin: typeof body.prepMin === 'number' ? body.prepMin : null,
      address: body.address || null,
      phone: body.phone || null,
      hours: body.hours || null,
      serviceMode: body.serviceMode || null,
      deliveryFeeCents: typeof body.deliveryFeeCents === 'number' ? body.deliveryFeeCents : null,
      minOrderCents: typeof body.minOrderCents === 'number' ? body.minOrderCents : null,
    }
  );
  return NextResponse.json({ ok: true, shop });
}

export async function GET(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  // #74 — on joint l'id de la card vitrine (+ son boosted_until) : c'est CETTE card que
  // le bouton « Booster » de « Mes boutiques » met en avant dans le feed. null si la
  // boutique n'est pas encore publiée (aucune vitrine → rien à booster).
  const meId = me.id;
  const shops = listSimpleShops(meId).map((s) => {
    const v = getVitrineCard(meId, (s as { id: string }).id);
    return { ...s, vitrine_card_id: v?.id ?? null, boosted_until: v?.boosted_until ?? null, managed_for: null as string | null };
  });
  // Boutiques que je GÈRE POUR UN TIERS (référent/apporteur) → MÊME liste, badge « de <proprio> ».
  // Le composer les montre à côté des miennes ; je peux poster/gérer la fiche du client. Pascal 2026-08-07.
  const managed = listAttachedShops(meId)
    .filter((a) => (a.kind || 'boutique') === 'boutique')
    .map((a) => {
      const full = getSimpleShop(a.id);
      const o = getUserById(a.owner_id) as { display_name?: string; username?: string } | null;
      return { ...(full || {}), id: a.id, name: a.name, kind: a.kind, cover_url: full?.cover_url ?? null,
        vitrine_card_id: null, boosted_until: null, managed_for: o?.display_name || o?.username || 'un client' };
    });
  return NextResponse.json({ ok: true, shops: [...shops, ...managed] });
}

// DELETE { id } → supprime une boutique/plat/resto du propriétaire (+ confirmation côté UI).
export async function DELETE(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  let body: { id?: string } = {};
  try { body = await req.json(); } catch { /* */ }
  if (!body.id) return NextResponse.json({ error: 'id_required' }, { status: 400 });
  const ok = deleteSimpleShop(body.id, me.id);
  if (!ok) return NextResponse.json({ error: 'not_found_or_not_owner' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
