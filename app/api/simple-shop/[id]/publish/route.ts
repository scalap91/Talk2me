/**
 * POST /api/simple-shop/[id]/publish (Pascal 2026-06-14)
 * Publie/rafraîchit la carte VITRINE d'un shop dans le feed.
 * - boutique  → vitrine publique (category null) → visible dans le Hub.
 * - plat_maison → category 'plat_maison' → visible UNIQUEMENT dans le feed Amis
 *   (la mama vend à ses voisins, pas au public).
 * Idempotent : 1 seule carte vitrine par shop (on met à jour si elle existe).
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { getSimpleShop, listItems, type SimpleShop, type SimpleItem } from '@/lib/simple-shop';
import { writeCardFile } from '@/lib/cards/card-file';
import type { SuperCard } from '@/lib/cards/supercard';

// Producteur boutique « pour de vrai » : construit le `.card` CONTENEUR (cover + nom +
// les VRAIS produits en `items[]`), keyé sur la card vitrine → le feed le rend en boutique.
function buildBoutiqueCard(cardId: string, shop: SimpleShop, items: SimpleItem[], owner: string): SuperCard {
  // Toute boutique a SA devanture : cover du shop → sinon 1re image produit → sinon défaut. (Pascal 2026-07-04)
  const DEFAULT_DEVANTURE = 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=800';
  const cover = shop.cover_url || items.find((i) => i.image_url)?.image_url || DEFAULT_DEVANTURE;
  return {
    format: 't2m.card', spec: 1, id: cardId, version: 1, state: 'published',
    title: shop.name, types: ['boutique'],
    // La card DÉCLARE sa section (Pascal 2026-07-05) : c'est ce `channel` que le feed lit
    // pour couper quand la section est OFF. Un post sans channel n'est jamais coupé.
    channel: shop.kind === 'plat_maison' ? 'eat' : 'boutique',
    // Action AU NIVEAU DU SHOP portée PAR la card (source de vérité) → le lecteur lit le libellé,
    // il ne le redérive plus en dur. Plat de Mama = « Commander », boutique = « Acheter ».
    actions: [{ kind: shop.kind === 'plat_maison' ? 'order' : 'buy', label: shop.kind === 'plat_maison' ? 'Commander' : 'Acheter' }],
    owner,
    ...(cover ? { images: [cover] } : {}),
    ...(shop.description ? { text: { body: shop.description } } : {}),
    items: items.map((it) => {
      // Card OS : on porte le RAYON de l'article (section, à défaut category) dans les
      // `specs` universels (clé `rayon`) → le lecteur boutique regroupe par rayon comme
      // le composer. Additif, sans casser les items existants. (Pascal 2026-07-09)
      const rayon = (it.section || it.category || '').trim();
      return {
        format: 't2m.card', spec: 1, id: it.id, version: 1, state: 'published',
        title: it.label || 'Article', types: ['product'], owner,
        ...(rayon ? { specs: { rayon } } : {}),
        ...(it.image_url ? { images: [it.image_url] } : {}),
        ...(it.price_cents != null ? { price: { amount: it.price_cents, currency: 'MGA' }, actions: [{ kind: 'buy', label: 'Acheter' }] } : {}),
      };
    }),
  } as unknown as SuperCard;
}
import { createDirectCard, getDb } from '@/lib/db';
import { upsertShopStatus } from '@/lib/status';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await ctx.params;
  const shop = getSimpleShop(id);
  if (!shop || shop.owner_id !== me.id) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const items = listItems(id);
  // Boutique VIDE (couverture mais 0 article) → NE PAS publier ni storyfier. (Pascal 2026-07-03)
  // Un plat_maison n'a pas d'items : le plat EST la couverture, donc on n'exige d'articles QUE pour la boutique.
  if (shop.kind !== 'plat_maison' && items.length === 0)
    return NextResponse.json({ error: 'no_items', message: 'Ajoute au moins un article avant de publier ta boutique.' }, { status: 400 });
  const media = shop.cover_url || items.find((it) => it.image_url)?.image_url || null;
  if (!media) return NextResponse.json({ error: 'no_media' }, { status: 400 });

  const category = shop.kind === 'plat_maison' ? 'plat_maison' : null;
  const caption = `${shop.name} [VITRINE:${id}]`;
  const db = getDb();

  // Boutiques ET plats → diffusés dans la MÊME story (kind 'shop', 24h, visible par les
  // amis). upsert = 1 seule story active par shop (pas de spam quand la vitrine se republie).
  // (Pascal 2026-06-20 : plats et boutiques dans la même story, pas de story à part.)
  try { upsertShopStatus(me.id, id, media, shop.name); } catch { /* best-effort */ }

  // Seuil FEED (Pascal 2026-07-10 : baissé de 2 à 1) : une BOUTIQUE monte au feed dès
  // qu'elle a AU MOINS 1 article. La boutique vide (0 article) est déjà bloquée plus haut
  // (no_items). Ce garde-fou ne retire donc plus rien en pratique — gardé pour cohérence
  // si on remontait le seuil un jour.
  const MIN_FEED_ITEMS = 1;
  if (shop.kind === 'boutique' && items.length < MIN_FEED_ITEMS) {
    const vitrine = db.prepare(
      "SELECT id FROM direct_cards WHERE user_id = ? AND caption LIKE ? AND deleted_at IS NULL LIMIT 1"
    ).get(me.id, `%[VITRINE:${id}]%`) as { id: string } | undefined;
    if (vitrine) db.prepare('UPDATE direct_cards SET deleted_at = ? WHERE id = ?').run(Date.now(), vitrine.id);
    return NextResponse.json({ ok: true, feed: false, items: items.length, message: 'Ajoute au moins un article pour diffuser ta boutique dans le feed.' });
  }

  // déjà une vitrine pour ce shop ? → on met juste à jour le média
  const existing = db.prepare(
    "SELECT id FROM direct_cards WHERE user_id = ? AND caption LIKE ? AND deleted_at IS NULL LIMIT 1"
  ).get(me.id, `%[VITRINE:${id}]%`) as { id: string } | undefined;

  if (existing) {
    db.prepare('UPDATE direct_cards SET media_url = ?, caption = ?, category = ? WHERE id = ?')
      .run(media, caption, category, existing.id);
    // Card OS : la vitrine re-publiée réécrit son `.card` boutique-conteneur (produits à jour).
    await writeCardFile(buildBoutiqueCard(existing.id, shop, items, me.id));
    return NextResponse.json({ ok: true, card_id: existing.id, updated: true });
  }

  const card = createDirectCard(me.id, { type: 'image', media_url: media, caption, category });
  await writeCardFile(buildBoutiqueCard(card.id, shop, items, me.id)); // Card OS : .card boutique-conteneur
  return NextResponse.json({ ok: true, card_id: card.id, updated: false });
}
