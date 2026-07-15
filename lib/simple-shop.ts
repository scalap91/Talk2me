'use server-only';

/**
 * Talk2Me — Commerces locaux du particulier (Pascal 2026-06-09).
 * Le commerçant met SES photos, chacune a un PRIX, paiement via Wallet T2M.
 *
 * SÉPARATION #2 (Pascal 2026-06-15, doctrine « ON NE MÉLANGE PAS ») : les 3
 * domaines vivent désormais dans des TABLES SÉPARÉES, plus dans une seule table
 * `simple_shops` discriminée par `kind` :
 *   - eat        → eat_shops      + eat_items
 *   - plat_maison→ plats_maison   + plat_items
 *   - boutique   → boutiques_perso+ boutique_items
 * Les 3 ont une structure identique → on route par helper (shopT/itemT) plutôt
 * que de tripler le CRUD. L'API publique du module est INCHANGÉE.
 * La grande boutique dropship Shop CJ est encore ailleurs (shop_products).
 */

import { randomUUID, randomBytes } from 'crypto';
import { commerceDb, COMMERCE_KINDS, shopTable, itemTable, type Kind } from '@/lib/commerce-dbs';
import { makeCard, serializeCard, parseCard, type CardType, type SuperCard } from '@/lib/cards/supercard';
import { writeCardFile } from '@/lib/cards/card-file';
import type Database from 'better-sqlite3';
import { getDb } from '@/lib/db-core';
import { getOpenSession } from '@/lib/live/session';

/**
 * Card OS : construit et STOCKE le `.card` d'un article boutique (source de vérité du
 * lecteur). channel = 'eat' pour les plats maison, 'boutique' sinon. Chaque champ → son rayon.
 * MGA (Ariary) : pas de centimes → unité mineure == montant affiché.
 */
function writeItemDotcard(db: Database.Database, table: string, it: SimpleItem, k: Kind): SimpleItem {
  try {
    let photos: string[] = [];
    try { photos = it.photos ? (JSON.parse(it.photos) as string[]) : []; } catch { /* */ }
    const images = photos.length ? photos : it.image_url ? [it.image_url] : [];
    let attrs: Record<string, string> = {};
    try { attrs = it.attributes ? (JSON.parse(it.attributes) as Record<string, string>) : {}; } catch { /* */ }
    const isEat = k === 'plat_maison' || k === 'eat';
    // Service/Emploi = annonces « listing + action chat » (pas d'achat). L'action
    // ouvre la conversation P2P (devis / candidature), jamais de checkout.
    const channel: 'eat' | 'boutique' = isEat ? 'eat' : 'boutique';
    const types: CardType[] = isEat ? ['restaurant'] : k === 'emploi' ? ['job'] : k === 'service' ? ['listing'] : ['product'];
    const card = makeCard({
      id: it.id,
      types,
      channel,
      title: it.label || 'Article',
      ...(images.length ? { images } : {}),
      ...(it.description ? { text: { body: it.description } } : {}),
      ...(it.price_cents != null ? { price: { amount: it.price_cents, currency: 'MGA' } } : {}),
      categories: it.category ? [it.category] : [],
      ...(Object.keys(attrs).length ? { specs: attrs } : {}),
      ...(it.quantity != null ? { stock: it.quantity } : {}),
      actions: isEat
        ? [{ kind: 'order', label: 'Commander' }]
        : k === 'service'
          ? [{ kind: 'contact', label: 'Demander un devis' }, { kind: 'share', label: 'Partager' }]
          : k === 'emploi'
            ? [{ kind: 'apply', label: 'Postuler' }, { kind: 'share', label: 'Partager' }]
            : [{ kind: 'buy', label: 'Acheter' }, { kind: 'share', label: 'Partager' }],
    });
    const dotcard = serializeCard(card);
    db.prepare(`UPDATE ${table} SET dotcard = ? WHERE id = ?`).run(dotcard, it.id);
    (it as SimpleItem & { dotcard?: string }).dotcard = dotcard;
    // Le lecteur lit le FICHIER `.card`, pas la colonne. On écrit donc AUSSI le fichier
    // (sinon l'item — ex. annonce — reste non conforme). Pascal 2026-07-11. Best-effort.
    void writeCardFile(card).catch(() => {});
  } catch { /* la card est un bonus : si ça casse, l'article reste valide */ }
  return it;
}

// 3 bases séparées (boutiques.db / plats.db / eat.db) — cf. lib/commerce-dbs.ts.
// Helpers : connexion + nom de table par kind. Pas de UNION SQL inter-base : les
// lectures cross-kind interrogent les 3 connexions et fusionnent en JS.
const norm = (kind?: string | null): Kind =>
  (kind === 'eat' || kind === 'plat_maison' || kind === 'service' || kind === 'emploi' || kind === 'rencontre') ? kind : 'boutique';
const dbFor = (kind?: string | null) => commerceDb(norm(kind));

function ensure() {
  // Déclenche création + migration one-time des 3 bases (idempotent).
  for (const k of COMMERCE_KINDS) commerceDb(k);
}

const ANNONCE_VALIDITY_MS = 90 * 24 * 60 * 60 * 1000; // 3 mois

export interface SimpleShop { id: string; owner_id: string; name: string; description: string | null; category: string | null; kind: string | null; public_key: string; wallet_enabled: number; created_at: number; lat: number | null; lng: number | null; cover_url: string | null; prep_min: number | null; address: string | null; phone: string | null; hours: string | null; service_mode: string | null; delivery_fee_cents: number | null; min_order_cents: number | null }
export interface SimpleItem { id: string; shop_id: string; image_url: string; label: string | null; price_cents: number; position: number; created_at: number; description: string | null; section: string | null; category?: string | null; attributes?: string | null; photos?: string | null; quantity?: number | null; annonce_on?: number; annonce_category?: string | null; annonce_city?: string | null; annonce_lat?: number | null; annonce_lng?: number | null; annonce_until?: number | null; dotcard?: string | null }

export function createSimpleShop(ownerId: string, name: string, description?: string, category?: string, kind: Kind = 'boutique', opts?: { lat?: number | null; lng?: number | null; coverUrl?: string | null; prepMin?: number | null; address?: string | null; phone?: string | null; hours?: string | null; serviceMode?: string | null; deliveryFeeCents?: number | null; minOrderCents?: number | null }): SimpleShop {
  ensure();
  const id = randomUUID();
  const key = randomBytes(7).toString('hex');
  const now = Date.now();
  dbFor(kind).prepare(`INSERT INTO ${shopTable(norm(kind))} (id, owner_id, name, description, category, kind, public_key, wallet_enabled, created_at, lat, lng, cover_url, prep_min, address, phone, hours, service_mode, delivery_fee_cents, min_order_cents) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, ownerId, (name || '').trim().slice(0, 80) || (kind === 'eat' ? 'Mon resto' : kind === 'plat_maison' ? 'Mes plats maison' : 'Ma boutique'), (description || '').trim().slice(0, 300) || null, (category || '').trim().slice(0, 40) || (kind === 'eat' ? 'Restaurant' : null), kind, key, now,
      opts?.lat ?? null, opts?.lng ?? null, opts?.coverUrl ?? null, opts?.prepMin ?? null,
      (opts?.address || '').slice(0, 200) || null, (opts?.phone || '').slice(0, 40) || null, (opts?.hours || '').slice(0, 200) || null,
      (opts?.serviceMode || '').slice(0, 60) || null,
      typeof opts?.deliveryFeeCents === 'number' ? opts.deliveryFeeCents : null,
      typeof opts?.minOrderCents === 'number' ? opts.minOrderCents : null);
  const shop = getSimpleShop(id)!;
  // Card OS : un service / une offre d'emploi EST une `.card` (Pascal 2026-07-11 « tout est card »).
  const k2 = norm(kind);
  if (k2 === 'service' || k2 === 'emploi' || k2 === 'plat_maison' || k2 === 'rencontre') {
    void writeCardFile(simpleListingToCard({ id: shop.id, name: shop.name, description: shop.description, category: shop.category, cover_url: shop.cover_url, address: shop.address }, k2)).catch(() => {});
  }
  return shop;
}

/** RENCONTRE : 1 SEUL profil par compte (Pascal 2026-07-14). Trouve le profil existant du user
 *  et le MET À JOUR, sinon en crée un. Réécrit toujours la `.card`. */
export function upsertRencontreProfile(ownerId: string, opts: { name: string; description?: string | null; age?: string | null; ville?: string | null; coverUrl?: string | null }): SimpleShop {
  ensure();
  const existing = listSimpleShops(ownerId).find((s) => norm(s.kind) === 'rencontre');
  if (existing) {
    const db = commerceDb('rencontre');
    const table = shopTable('rencontre');
    db.prepare(`UPDATE ${table} SET name = ?, description = ?, service_mode = ?, address = ?, cover_url = COALESCE(?, cover_url) WHERE id = ? AND owner_id = ?`)
      .run(
        (opts.name || '').trim().slice(0, 80) || existing.name,
        (opts.description || '').trim().slice(0, 300) || null,
        (opts.age || '').trim() || null,
        (opts.ville || '').trim() || null,
        opts.coverUrl || null,
        existing.id, ownerId,
      );
    const shop = getSimpleShop(existing.id)!;
    void writeCardFile(simpleListingToCard({ id: shop.id, name: shop.name, description: shop.description, category: shop.category, cover_url: shop.cover_url, address: shop.address }, 'rencontre')).catch(() => {});
    return shop;
  }
  return createSimpleShop(ownerId, opts.name, opts.description || undefined, undefined, 'rencontre', {
    coverUrl: opts.coverUrl || null,
    address: (opts.ville || '').trim() || null,
    serviceMode: (opts.age || '').trim() || null,
  });
}

/** Un service / emploi / plat-maison (conteneur) → `.card`. Pascal 2026-07-11 « tout est card ». */
export function simpleListingToCard(
  l: { id: string; name: string; description?: string | null; category?: string | null; cover_url?: string | null; address?: string | null; tarif?: string | null; place?: string | null },
  kind: 'service' | 'emploi' | 'plat_maison' | 'rencontre',
): SuperCard {
  const emploi = kind === 'emploi';
  const plat = kind === 'plat_maison';
  const rencontre = kind === 'rencontre';
  const sub = [l.category, l.tarif, l.place, l.address, l.description].filter(Boolean).join(' · ');
  return makeCard({
    id: l.id,
    title: l.name || (emploi ? 'Offre' : plat ? 'Plats maison' : rencontre ? 'Profil' : 'Service'),
    types: [emploi ? 'job' : plat ? 'restaurant' : 'listing'],
    channel: plat ? 'eat' : undefined,
    images: l.cover_url ? [l.cover_url] : [],
    ...(sub ? { text: { body: sub } } : {}),
    actions: [{ kind: emploi ? 'apply' : plat ? 'order' : 'contact', label: emploi ? 'Postuler' : plat ? 'Commander' : rencontre ? 'Écrire' : 'Demander un devis' }],
  });
}

/** Backfill : écrit le fichier `.card` de tous les services + emplois + plats-maison (conteneurs)
 *  + annonces (items). Pascal 2026-07-11 « tout est card ». Idempotent, best-effort. */
export async function backfillServiceEmploiCards(): Promise<number> {
  let n = 0;
  for (const kind of ['service', 'emploi'] as const) {
    for (const l of listListings(kind)) {
      try { await writeCardFile(simpleListingToCard(l, kind)); n++; } catch { /* */ }
    }
  }
  // Plat-maison (conteneur) → `.card`.
  for (const s of listAllShopsByKind('plat_maison')) {
    try { await writeCardFile(simpleListingToCard({ id: s.id, name: s.name, description: s.description, category: s.category, cover_url: s.cover_url, address: s.address }, 'plat_maison')); n++; } catch { /* */ }
  }
  // Annonces (items) : écrit le FICHIER depuis leur dotcard colonne (déjà construit par writeItemDotcard).
  try {
    const rows = commerceDb('boutique').prepare('SELECT dotcard FROM boutique_items WHERE annonce_on = 1 AND dotcard IS NOT NULL').all() as { dotcard: string }[];
    for (const r of rows) {
      try { const p = parseCard(r.dotcard); if (p.ok && p.card) { await writeCardFile(p.card); n++; } } catch { /* */ }
    }
  } catch { /* */ }
  return n;
}

/** Supprime une boutique / plat maison / resto (PROPRIÉTAIRE uniquement) + ses articles.
 *  Renvoie true si quelque chose a été supprimé. (Pascal 2026-06-17) */
export function deleteSimpleShop(id: string, ownerId: string): boolean {
  ensure();
  const shop = getSimpleShop(id);
  if (!shop || shop.owner_id !== ownerId) return false;
  const k = norm(shop.kind);
  const db = dbFor(k);
  db.prepare(`DELETE FROM ${itemTable(k)} WHERE shop_id = ?`).run(id);
  return db.prepare(`DELETE FROM ${shopTable(k)} WHERE id = ? AND owner_id = ?`).run(id, ownerId).changes > 0;
}

export function getSimpleShop(id: string): SimpleShop | null {
  ensure();
  for (const k of COMMERCE_KINDS) {
    const r = commerceDb(k).prepare(`SELECT * FROM ${shopTable(k)} WHERE id = ?`).get(id) as SimpleShop | undefined;
    if (r) return r;
  }
  return null;
}
export function getSimpleShopByKey(key: string): SimpleShop | null {
  ensure();
  for (const k of COMMERCE_KINDS) {
    const r = commerceDb(k).prepare(`SELECT * FROM ${shopTable(k)} WHERE public_key = ?`).get(key) as SimpleShop | undefined;
    if (r) return r;
  }
  return null;
}
/** Audit : TOUTES les boutiques d'un kind (ex. plat_maison), sans filtre owner/géo. */
export function listAllShopsByKind(kind: Kind): SimpleShop[] {
  ensure();
  return commerceDb(kind).prepare(`SELECT * FROM ${shopTable(norm(kind))}`).all() as SimpleShop[];
}
export function listSimpleShops(ownerId: string): SimpleShop[] {
  ensure();
  const out: SimpleShop[] = [];
  for (const k of COMMERCE_KINDS) {
    out.push(...(commerceDb(k).prepare(`SELECT * FROM ${shopTable(k)} WHERE owner_id = ?`).all(ownerId) as SimpleShop[]));
  }
  return out.sort((a, b) => b.created_at - a.created_at);
}
/** Annonces publiques Service ou Emploi (listing + action chat). PII air-gap : on
 *  n'expose PAS owner_id/tel/email — seulement les champs de l'annonce + public_key
 *  (clé opaque servant à ouvrir la conversation P2P via /api/simple-shop/contact).
 *  Le shop EST l'annonce : name=titre, category=métier/type, service_mode=tarif/rému,
 *  address=zone/lieu, description, cover_url. */
export interface PublicListing { id: string; public_key: string; name: string; description: string | null; category: string | null; tarif: string | null; place: string | null; cover_url: string | null; created_at: number; online?: boolean; live?: boolean }
export function listListings(kind: 'service' | 'emploi' | 'rencontre'): PublicListing[] {
  ensure();
  const rows = commerceDb(kind).prepare(
    `SELECT id, public_key, name, description, category, service_mode, address, cover_url, created_at, owner_id
       FROM ${shopTable(kind)} ORDER BY created_at DESC LIMIT 200`
  ).all() as Array<{ id: string; public_key: string; name: string; description: string | null; category: string | null; service_mode: string | null; address: string | null; cover_url: string | null; created_at: number; owner_id: string }>;
  // « En ligne » = last_seen récent (< 5 min), calculé côté serveur SANS exposer l'owner_id
  // (PII air-gap). Pascal 2026-07-14. La base users est dans la base principale (getDb).
  const online = new Set<string>();
  const owners = Array.from(new Set(rows.map((r) => r.owner_id).filter(Boolean)));
  if (owners.length) {
    try {
      const cutoff = Date.now() - 5 * 60 * 1000;
      const ph = owners.map(() => '?').join(',');
      const seen = getDb().prepare(`SELECT id, last_seen FROM users WHERE id IN (${ph})`).all(...owners) as { id: string; last_seen: number | null }[];
      for (const u of seen) if ((u.last_seen ?? 0) > cutoff) online.add(u.id);
    } catch { /* pas de présence → pas de badge */ }
  }
  // « LIVE » = le propriétaire a une SESSION LIVE ouverte (getOpenSession). Pascal 2026-07-14.
  const live = new Set<string>();
  for (const oid of owners) { try { if (getOpenSession(oid)) live.add(oid); } catch { /* */ } }
  return rows.map((r) => ({
    id: r.id, public_key: r.public_key, name: r.name, description: r.description,
    category: r.category, tarif: r.service_mode, place: r.address, cover_url: r.cover_url, created_at: r.created_at,
    online: online.has(r.owner_id),
    live: live.has(r.owner_id),
  }));
}

export function listItems(shopId: string): SimpleItem[] {
  ensure();
  const out: SimpleItem[] = [];
  for (const k of COMMERCE_KINDS) {
    const db = commerceDb(k);
    const rows = db.prepare(`SELECT * FROM ${itemTable(k)} WHERE shop_id = ?`).all(shopId) as SimpleItem[];
    for (const it of rows) {
      // Card OS : auto-migration paresseuse — un article sans `.card` le génère à la 1re
      // lecture (idempotent). Garantit que la vitrine lit du VRAI `.card`, pas le fallback.
      if (!it.dotcard) writeItemDotcard(db, itemTable(k), it, k);
      out.push(it);
    }
  }
  return out.sort((a, b) => (a.position - b.position) || (a.created_at - b.created_at));
}
/** TOUS les articles (Pascal 2026-07-14) : produits de TOUTES les boutiques + les ANNONCES
 *  publiées de tous les autres types (service/emploi/plat/eat où annonce_on = 1).
 *  Génère paresseusement le `.card` manquant (comme listItems). */
export function listArticleItems(): SimpleItem[] {
  ensure();
  const out: SimpleItem[] = [];
  for (const k of COMMERCE_KINDS) {
    const db = commerceDb(k);
    const table = itemTable(k);
    // Boutique = TOUS les produits ; autres types = seulement ce qui est publié en annonce.
    const where = k === 'boutique' ? '' : 'WHERE annonce_on = 1';
    let rows: SimpleItem[] = [];
    try { rows = db.prepare(`SELECT * FROM ${table} ${where} ORDER BY created_at DESC`).all() as SimpleItem[]; } catch { rows = []; }
    for (const it of rows) {
      if (!it.dotcard) { try { writeItemDotcard(db, table, it, k); } catch { /* best-effort */ } }
      out.push(it);
    }
  }
  return out.sort((a, b) => b.created_at - a.created_at);
}

/** `.card` (dotcard) des articles/annonces sélectionnés → items imbriqués dans un post. Toutes tables. */
export function getArticleDotcardsByIds(ids: string[]): { id: string; dotcard: string | null }[] {
  ensure();
  const clean = Array.from(new Set(ids.filter((x) => typeof x === 'string' && x.trim()))).slice(0, 30);
  if (!clean.length) return [];
  const ph = clean.map(() => '?').join(',');
  const out: { id: string; dotcard: string | null }[] = [];
  for (const k of COMMERCE_KINDS) {
    try {
      const rows = commerceDb(k).prepare(`SELECT id, dotcard FROM ${itemTable(k)} WHERE id IN (${ph})`).all(...clean) as { id: string; dotcard: string | null }[];
      out.push(...rows);
    } catch { /* table absente → suivant */ }
  }
  return out;
}

/** Inspecteur (source-agnostique) : `.card` + méta d'un article par id (toutes tables commerce). */
export function getItemInspect(id: string): { user_id: string; created_at: number; dotcard: string | null } | null {
  ensure();
  for (const k of COMMERCE_KINDS) {
    try {
      const it = commerceDb(k).prepare(`SELECT shop_id, created_at, dotcard FROM ${itemTable(k)} WHERE id = ?`).get(id) as
        { shop_id: string; created_at: number; dotcard: string | null } | undefined;
      if (it) {
        const shop = getSimpleShop(it.shop_id);
        return { user_id: (shop as { owner_id?: string } | null)?.owner_id ?? '', created_at: it.created_at, dotcard: it.dotcard };
      }
    } catch { /* table absente */ }
  }
  return null;
}

/** Résout un article/produit → sa boutique (pour ouvrir BoutiqueSheet + acheter). Pascal 2026-07-14. */
export function getItemShop(id: string): { shopId: string; shopKey: string | null } | null {
  ensure();
  for (const k of COMMERCE_KINDS) {
    try {
      const it = commerceDb(k).prepare(`SELECT shop_id FROM ${itemTable(k)} WHERE id = ?`).get(id) as { shop_id: string } | undefined;
      if (it?.shop_id) {
        const shop = getSimpleShop(it.shop_id) as { public_key?: string | null } | null;
        return { shopId: it.shop_id, shopKey: shop?.public_key ?? null };
      }
    } catch { /* table absente */ }
  }
  return null;
}

/** Card OS : génère le `.card` de TOUS les articles sans (migration globale, idempotent). */
export function backfillBoutiqueCards(): { converted: number } {
  ensure();
  let converted = 0;
  for (const k of COMMERCE_KINDS) {
    const db = commerceDb(k);
    let rows: SimpleItem[] = [];
    try { rows = db.prepare(`SELECT * FROM ${itemTable(k)} WHERE dotcard IS NULL OR dotcard = ''`).all() as SimpleItem[]; } catch { continue; }
    for (const it of rows) { try { writeItemDotcard(db, itemTable(k), it, k); converted++; } catch { /* skip */ } }
  }
  return { converted };
}

/** Card OS diag : couverture `.card` par canal commerce. eat = plats (plat_maison+eat) ;
 *  boutique = articles boutique. Séparés pour prouver les 2 canaux distinctement. */
function countKinds(kinds: Kind[]): { total: number; withCard: number } {
  ensure();
  let total = 0, withCard = 0;
  for (const k of kinds) {
    const db = commerceDb(k);
    try {
      total += (db.prepare(`SELECT COUNT(*) c FROM ${itemTable(k)}`).get() as { c: number }).c;
      withCard += (db.prepare(`SELECT COUNT(*) c FROM ${itemTable(k)} WHERE dotcard IS NOT NULL AND dotcard <> ''`).get() as { c: number }).c;
    } catch { /* table absente */ }
  }
  return { total, withCard };
}
export function countBoutiqueCards(): { total: number; withCard: number } { return countKinds(['boutique']); }
export function countEatCards(): { total: number; withCard: number } { return countKinds(['plat_maison', 'eat']); }

export function addItem(shopId: string, imageUrl: string, priceCents: number, label?: string | null, extra?: { description?: string | null; section?: string | null; category?: string | null; attributes?: string | null; photos?: string | null; quantity?: number | null }): SimpleItem {
  ensure();
  const shop = getSimpleShop(shopId);
  const k = norm(shop?.kind);
  const db = dbFor(k);
  const table = itemTable(k);
  const id = randomUUID();
  const now = Date.now();
  const pos = (db.prepare(`SELECT COUNT(*) c FROM ${table} WHERE shop_id = ?`).get(shopId) as { c: number }).c;
  const qty = extra?.quantity != null && Number.isFinite(Number(extra.quantity)) ? Math.max(0, Math.round(Number(extra.quantity))) : null;
  db.prepare(`INSERT INTO ${table} (id, shop_id, image_url, label, price_cents, position, created_at, description, section, category, attributes, photos, quantity) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, shopId, imageUrl, (label || '').slice(0, 120) || null, Math.max(0, Math.round(priceCents)), pos, now,
      (extra?.description || '').slice(0, 2000) || null, (extra?.section || '').slice(0, 40) || null,
      (extra?.category || '').slice(0, 40) || null, extra?.attributes || null, extra?.photos || null, qty);
  const item = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id) as SimpleItem;
  return writeItemDotcard(db, table, item, k);
}

/** Plats maison à proximité (rayon en mètres) — les voisins connectés les voient. */
export function listPlatMaisonNearby(lat: number, lng: number, radiusM = 500, excludeOwner?: string): Array<SimpleShop & { dist_m: number; items_count: number }> {
  ensure();
  const db = commerceDb('plat_maison');
  const rows = db.prepare(`SELECT * FROM ${shopTable('plat_maison')} WHERE lat IS NOT NULL AND lng IS NOT NULL`).all() as SimpleShop[];
  const R = 6371000, toRad = (d: number) => (d * Math.PI) / 180;
  const out: Array<SimpleShop & { dist_m: number; items_count: number }> = [];
  for (const s of rows) {
    if (excludeOwner && s.owner_id === excludeOwner) continue;
    const dLat = toRad((s.lat as number) - lat), dLng = toRad((s.lng as number) - lng);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat)) * Math.cos(toRad(s.lat as number)) * Math.sin(dLng / 2) ** 2;
    const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    if (dist > radiusM) continue;
    const c = (db.prepare(`SELECT COUNT(*) c FROM ${itemTable('plat_maison')} WHERE shop_id = ?`).get(s.id) as { c: number }).c;
    out.push({ ...s, dist_m: Math.round(dist), items_count: c });
  }
  return out.sort((a, b) => a.dist_m - b.dist_m).slice(0, 30);
}

/** Commerces d'un kind donné à proximité (rayon en mètres) — pour le RADAR. */
export function listShopsNearby(kind: string, lat: number, lng: number, radiusM = 500): Array<SimpleShop & { dist_m: number; items_count: number }> {
  ensure();
  const k = norm(kind);
  const db = dbFor(k);
  const rows = db.prepare(`SELECT * FROM ${shopTable(k)} WHERE lat IS NOT NULL AND lng IS NOT NULL`).all() as SimpleShop[];
  const R = 6371000, toRad = (d: number) => (d * Math.PI) / 180;
  const out: Array<SimpleShop & { dist_m: number; items_count: number }> = [];
  for (const s of rows) {
    const dLat = toRad((s.lat as number) - lat), dLng = toRad((s.lng as number) - lng);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat)) * Math.cos(toRad(s.lat as number)) * Math.sin(dLng / 2) ** 2;
    const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    if (dist > radiusM) continue;
    const c = (db.prepare(`SELECT COUNT(*) c FROM ${itemTable(k)} WHERE shop_id = ?`).get(s.id) as { c: number }).c;
    out.push({ ...s, dist_m: Math.round(dist), items_count: c });
  }
  return out.sort((a, b) => a.dist_m - b.dist_m).slice(0, 40);
}
export function deleteItem(shopId: string, itemId: string): void {
  ensure();
  const k = norm(getSimpleShop(shopId)?.kind);
  dbFor(k).prepare(`DELETE FROM ${itemTable(k)} WHERE id = ? AND shop_id = ?`).run(itemId, shopId);
}
/** Remplace la photo d'un article (ex : après nettoyage IA). Pascal 2026-06-11. */
export function updateItemImage(shopId: string, itemId: string, imageUrl: string): SimpleItem | null {
  ensure();
  if (!imageUrl || !imageUrl.startsWith('/uploads/')) return null;
  const k = norm(getSimpleShop(shopId)?.kind);
  const db = dbFor(k);
  db.prepare(`UPDATE ${itemTable(k)} SET image_url = ? WHERE id = ? AND shop_id = ?`).run(imageUrl, itemId, shopId);
  return (db.prepare(`SELECT * FROM ${itemTable(k)} WHERE id = ?`).get(itemId) as SimpleItem) || null;
}
/** Ré-éditer un article (nom, prix, description). owner via shop_id. Pascal 2026-06-20. */
export function updateItemFields(shopId: string, itemId: string, fields: { label?: string | null; price_cents?: number; description?: string | null; category?: string | null; attributes?: string | null; photos?: string | null; quantity?: number | null }): SimpleItem | null {
  ensure();
  const k = norm(getSimpleShop(shopId)?.kind);
  const db = dbFor(k);
  const sets: string[] = []; const vals: (string | number | null)[] = [];
  if (fields.label !== undefined) { sets.push('label = ?'); vals.push((fields.label || '').slice(0, 120) || null); }
  if (fields.price_cents !== undefined) { sets.push('price_cents = ?'); vals.push(Math.max(0, Math.round(fields.price_cents))); }
  if (fields.description !== undefined) { sets.push('description = ?'); vals.push((fields.description || '').slice(0, 2000) || null); }
  if (fields.category !== undefined) { sets.push('category = ?'); vals.push((fields.category || '').slice(0, 40) || null); }
  if (fields.attributes !== undefined) { sets.push('attributes = ?'); vals.push(fields.attributes || null); }
  if (fields.photos !== undefined) { sets.push('photos = ?'); vals.push(fields.photos || null); }
  if (fields.quantity !== undefined) { sets.push('quantity = ?'); vals.push(fields.quantity != null && Number.isFinite(Number(fields.quantity)) ? Math.max(0, Math.round(Number(fields.quantity))) : null); }
  if (sets.length) db.prepare(`UPDATE ${itemTable(k)} SET ${sets.join(', ')} WHERE id = ? AND shop_id = ?`).run(...vals, itemId, shopId);
  const item = (db.prepare(`SELECT * FROM ${itemTable(k)} WHERE id = ?`).get(itemId) as SimpleItem) || null;
  return item ? writeItemDotcard(db, itemTable(k), item, k) : null;
}

/** (Dés)active l'article dans les Petites annonces + champs annonce. Validité 3 mois à l'activation. */
export function setItemAnnonce(shopId: string, ownerId: string, itemId: string, on: boolean,
  opts?: { category?: string | null; city?: string | null; lat?: number | null; lng?: number | null }): SimpleItem | null {
  ensure();
  const db = commerceDb('boutique'); // annonces = boutiques uniquement (même base → JOIN valide)
  // ownership : l'article appartient à une boutique de l'owner
  const own = db.prepare('SELECT i.id FROM boutique_items i JOIN boutiques_perso s ON s.id = i.shop_id WHERE i.id = ? AND i.shop_id = ? AND s.owner_id = ?').get(itemId, shopId, ownerId);
  if (!own) return null;
  if (on) {
    const until = Date.now() + ANNONCE_VALIDITY_MS;
    db.prepare('UPDATE boutique_items SET annonce_on = 1, annonce_category = ?, annonce_city = ?, annonce_lat = ?, annonce_lng = ?, annonce_until = ? WHERE id = ?')
      .run(opts?.category || 'Autres', opts?.city || null, opts?.lat ?? null, opts?.lng ?? null, until, itemId);
  } else {
    db.prepare('UPDATE boutique_items SET annonce_on = 0 WHERE id = ?').run(itemId);
  }
  return (db.prepare('SELECT * FROM boutique_items WHERE id = ?').get(itemId) as SimpleItem) || null;
}

/** Articles boutique ACTUELLEMENT badgés « annonce » (annonce_on=1, non expirés),
 *  enrichis vendeur + boutique. Source de vérité = le flag (pas de duplication en
 *  deposit_annonces). Fait apparaître ces articles dans le feed Petites annonces. */
export function listAnnonceItems(opts: { category?: string; city?: string } = {}): Array<{ id: string; title: string; description: string | null; category: string; price_cents: number; city: string | null; image_url: string; owner_id: string; shop_key: string; shop_name: string; created_at: number; attributes: string | null; photos: string | null; quantity: number | null }> {
  ensure();
  const db = commerceDb('boutique');
  const where = ['i.annonce_on = 1', 'i.annonce_until > ?'];
  const args: unknown[] = [Date.now()];
  if (opts.category) { where.push('i.annonce_category = ?'); args.push(opts.category); }
  if (opts.city) { where.push('LOWER(i.annonce_city) = LOWER(?)'); args.push(opts.city.trim()); }
  const rows = db.prepare(
    `SELECT i.*, s.owner_id AS owner_id, s.public_key AS shop_key, s.name AS shop_name
       FROM boutique_items i JOIN boutiques_perso s ON s.id = i.shop_id
      WHERE ${where.join(' AND ')} ORDER BY i.created_at DESC LIMIT 200`
  ).all(...args) as Array<SimpleItem & { owner_id: string; shop_key: string; shop_name: string }>;
  return rows.map((r) => ({
    id: r.id, title: r.label || 'Article', description: r.description, category: r.annonce_category || r.category || 'Autres',
    price_cents: r.price_cents, city: r.annonce_city || null, image_url: r.image_url,
    owner_id: r.owner_id, shop_key: r.shop_key, shop_name: r.shop_name, created_at: r.created_at,
    attributes: (r as { attributes?: string | null }).attributes ?? null,
    photos: (r as { photos?: string | null }).photos ?? null,
    quantity: (r as { quantity?: number | null }).quantity ?? null,
  }));
}

/** MES articles badgés « annonce » (pour les éditer depuis la rubrique Annonces). */
export function listMyAnnonceItems(ownerId: string): Array<{ id: string; shop_id: string; title: string; price_cents: number; image_url: string; category: string; city: string | null; status: string }> {
  ensure();
  const db = commerceDb('boutique');
  const rows = db.prepare(
    `SELECT i.id, i.shop_id, i.label, i.price_cents, i.image_url, i.annonce_category, i.annonce_city, i.annonce_until
       FROM boutique_items i JOIN boutiques_perso s ON s.id = i.shop_id
      WHERE s.owner_id = ? AND i.annonce_on = 1 ORDER BY i.created_at DESC`
  ).all(ownerId) as Array<{ id: string; shop_id: string; label: string | null; price_cents: number; image_url: string; annonce_category: string | null; annonce_city: string | null; annonce_until: number | null }>;
  const now = Date.now();
  return rows.map((r) => ({
    id: r.id, shop_id: r.shop_id, title: r.label || 'Article', price_cents: r.price_cents, image_url: r.image_url,
    category: r.annonce_category || 'Autres', city: r.annonce_city || null,
    status: (r.annonce_until && r.annonce_until > now) ? 'published' : 'expired',
  }));
}

/** Article boutique par id, pour l'ACHAT (prix + vendeur résolus serveur). */
export function getBoutiqueItemForPurchase(itemId: string): { id: string; price_cents: number; owner_id: string } | null {
  ensure();
  const db = commerceDb('boutique');
  const r = db.prepare('SELECT i.id, i.price_cents, s.owner_id FROM boutique_items i JOIN boutiques_perso s ON s.id = i.shop_id WHERE i.id = ?').get(itemId) as { id: string; price_cents: number; owner_id: string } | undefined;
  return r || null;
}

/** Renouvelle la validité annonce pour 3 mois (à partir de maintenant). */
export function renewItemAnnonce(shopId: string, ownerId: string, itemId: string): SimpleItem | null {
  ensure();
  const db = commerceDb('boutique');
  const own = db.prepare('SELECT i.id FROM boutique_items i JOIN boutiques_perso s ON s.id = i.shop_id WHERE i.id = ? AND i.shop_id = ? AND s.owner_id = ?').get(itemId, shopId, ownerId);
  if (!own) return null;
  db.prepare('UPDATE boutique_items SET annonce_on = 1, annonce_until = ? WHERE id = ?').run(Date.now() + ANNONCE_VALIDITY_MS, itemId);
  return (db.prepare('SELECT * FROM boutique_items WHERE id = ?').get(itemId) as SimpleItem) || null;
}

export function setWalletEnabled(id: string, ownerId: string, on: boolean): void {
  ensure();
  const k = norm(getSimpleShop(id)?.kind);
  dbFor(k).prepare(`UPDATE ${shopTable(k)} SET wallet_enabled = ? WHERE id = ? AND owner_id = ?`).run(on ? 1 : 0, id, ownerId);
}
/** Longueur mini d'une description « complète » pour apparaître dans les Petites
 *  annonces (Pascal 2026-06-11 : pas de description complète → pas d'annonce). */
export const MIN_ANNONCE_DESC = 20;
export function isAnnonceReady(description: string | null | undefined): boolean {
  return !!description && description.trim().length >= MIN_ANNONCE_DESC;
}
/** Met à jour la description de la boutique (owner only). */
/** Met à jour la position d'un plat/boutique (pour la visibilité 500 m). Pascal 2026-06-20. */
export function updateShopGeo(id: string, ownerId: string, lat: number, lng: number): SimpleShop | null {
  ensure();
  const k = norm(getSimpleShop(id)?.kind);
  dbFor(k).prepare(`UPDATE ${shopTable(k)} SET lat = ?, lng = ? WHERE id = ? AND owner_id = ?`).run(lat, lng, id, ownerId);
  return getSimpleShop(id);
}

export function updateShopDescription(id: string, ownerId: string, description: string): SimpleShop | null {
  ensure();
  const k = norm(getSimpleShop(id)?.kind);
  const desc = (description || '').trim().slice(0, 300) || null;
  dbFor(k).prepare(`UPDATE ${shopTable(k)} SET description = ? WHERE id = ? AND owner_id = ?`).run(desc, id, ownerId);
  return getSimpleShop(id);
}

/** Renommer la devanture (Pascal 2026-07-05 : « revenir changer le nom »). */
export function updateShopName(id: string, ownerId: string, name: string): SimpleShop | null {
  ensure();
  const clean = (name || '').trim().slice(0, 80);
  if (!clean) return getSimpleShop(id);
  const k = norm(getSimpleShop(id)?.kind);
  dbFor(k).prepare(`UPDATE ${shopTable(k)} SET name = ? WHERE id = ? AND owner_id = ?`).run(clean, id, ownerId);
  return getSimpleShop(id);
}
