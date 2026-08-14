import 'server-only';

/**
 * Talk2Me — DÉPÔT D'ANNONCE (Pascal 2026-06-11). Dans la page Annonces, un bouton
 * « Déposer votre annonce » ouvre un FORMULAIRE IMPOSÉ : photo, catégorie, titre,
 * description, prix, ville. L'annonce peut être enregistrée en BROUILLON, PUBLIÉE,
 * ou rattachée à une de ses boutiques (simple_shops). Données réelles (grounding).
 */
import { randomUUID } from 'crypto';
import { formatMoney, toMinor } from '@/lib/money';
import { makeCard, serializeCard } from '@/lib/cards/supercard';
import { saveToMoteur } from '@/lib/cards/moteur-sync';
import { getReferent, getApporteur } from '@/lib/referents';
import { getAnnoncesDb } from '@/lib/annonces-db';
import { getUserById } from '@/lib/db';
import { getSimpleShop, listAnnonceItems } from '@/lib/simple-shop';

export const ANNONCE_CATEGORIES = [
  'Mode', 'Maison', 'Électronique', 'Téléphones', 'Véhicules',
  'Beauté', 'Plat', 'Loisirs', 'Services', 'Emploi', 'Immobilier', 'Autres',
] as const;

export interface DepositAnnonce {
  id: string;
  user_id: string;
  shop_id: string | null;
  title: string;
  description: string | null;
  category: string;
  price_cents: number | null;
  city: string | null;
  image_url: string | null;
  status: 'draft' | 'published';
  lat: number | null;
  lng: number | null;
  rental?: number | null;          // 1 = location de véhicule (sinon vente)
  driver_option?: string | null;   // 'with' | 'without' | 'both'
  attributes?: string | null;      // JSON {clé:valeur} — détails structurés (couleur, taille…)
  photos?: string | null;          // JSON [url,…] — galerie (la 1re = image_url de couverture)
  quantity?: number | null;        // stock (NULL = non applicable : emploi, immobilier, service)
  relist_at?: number | null;       // masquée du feed jusqu'à cette date (ms) — remise en ligne auto
  boosted_until?: number | null;   // mise en avant (vedette) jusqu'à cette date (ms) — payé PaPi
  deposit_cents?: number | null;   // acompte de réservation demandé par le vendeur
  reserved_until?: number | null;  // réservé (acompte payé) jusqu'à cette date (ms)
  reserved_by?: string | null;     // user qui a réservé
  dotcard?: string | null;         // Card OS : le `.card` stocké (source de vérité du lecteur)
  created_at: number;
  updated_at: number;
}

// Base dédiée annonces.db (création + migration gérées par getAnnoncesDb).
function ensure() { getAnnoncesDb(); }
const db_ = () => getAnnoncesDb();

function clampCat(c: string | null | undefined): string {
  const v = (c || '').trim();
  return (ANNONCE_CATEGORIES as readonly string[]).includes(v) ? v : 'Autres';
}

export interface UpsertAnnonceInput {
  id?: string;
  title: string;
  description?: string | null;
  category: string;
  price?: number | null; // euros
  city?: string | null;
  image_url?: string | null;
  shop_id?: string | null;
  status: 'draft' | 'published';
  lat?: number | null;
  lng?: number | null;
  rental?: boolean | null;          // location de véhicule
  driver_option?: string | null;    // 'with' | 'without' | 'both'
  attributes?: Record<string, string> | null; // détails structurés
  photos?: string[] | null;         // galerie multi-photos
  quantity?: number | null;         // stock (null = non applicable)
  relist_at?: number | null;        // remise en ligne auto (ms) — masquée du feed jusque-là
  deposit?: number | null;          // acompte de réservation demandé (Ar)
}

/** Marque une annonce RÉSERVÉE (acompte payé) jusqu'à untilMs. Appelé au callback PaPi. */
export function setAnnonceReserved(annonceId: string, byUserId: string, untilMs: number): boolean {
  ensure();
  return db_().prepare('UPDATE deposit_annonces SET reserved_until = ?, reserved_by = ?, updated_at = ? WHERE id = ?')
    .run(Math.round(untilMs), byUserId, Date.now(), annonceId).changes > 0;
}

/** Infos pour réserver : propriétaire + acompte demandé + état réservé courant. */
export function getAnnonceForReserve(id: string): { owner_id: string; deposit_cents: number | null; reserved_until: number | null; title: string } | null {
  ensure();
  const r = db_().prepare('SELECT user_id, deposit_cents, reserved_until, title FROM deposit_annonces WHERE id = ?').get(id) as { user_id: string; deposit_cents: number | null; reserved_until: number | null; title: string } | undefined;
  return r ? { owner_id: r.user_id, deposit_cents: r.deposit_cents ?? null, reserved_until: r.reserved_until ?? null, title: r.title } : null;
}

/** Crée ou met à jour une annonce de l'utilisateur (ownership vérifiée à l'update). */
export function upsertAnnonce(userId: string, input: UpsertAnnonceInput): DepositAnnonce | null {
  ensure();
  const db = db_();
  const now = Date.now();
  const title = (input.title || '').trim().slice(0, 120);
  if (!title) return null;
  const description = (input.description || '').trim().slice(0, 2000) || null;
  const category = clampCat(input.category);
  const price_cents = input.price != null && !Number.isNaN(Number(input.price)) ? Math.max(0, toMinor(Number(input.price))) : null;
  const city = (input.city || '').trim().slice(0, 80) || null;
  // Galerie multi-photos : on garde jusqu'à 8 ; la 1re sert de couverture (image_url). Accepte
  // /uploads/x OU l'URL ABSOLUE https://host/uploads/x (le natif envoie parfois l'absolue) → relatif.
  const toRel = (u: unknown): string | null => {
    if (typeof u !== 'string' || !u) return null;
    if (u.startsWith('/uploads/')) return u;
    return u.match(/^https?:\/\/[^/]+(\/uploads\/.+)$/)?.[1] ?? null;
  };
  const photosArr = Array.isArray(input.photos)
    ? input.photos.map(toRel).filter((u): u is string => !!u).slice(0, 8) : [];
  const photos = photosArr.length ? JSON.stringify(photosArr) : null;
  const image_url = photosArr[0] || toRel(input.image_url) || null;
  // Détails structurés (couleur, taille, marque…) → JSON, plus jamais dans la description.
  const attributes = input.attributes && typeof input.attributes === 'object' && Object.keys(input.attributes).length
    ? JSON.stringify(input.attributes) : null;
  // Stock : entier ≥ 0 si fourni, sinon NULL (non applicable).
  const quantity = input.quantity != null && Number.isFinite(Number(input.quantity)) ? Math.max(0, Math.round(Number(input.quantity))) : null;
  // Remise en ligne auto (immobilier occupé) : timestamp ms futur, sinon NULL (visible).
  const relist_at = input.relist_at != null && Number.isFinite(Number(input.relist_at)) && Number(input.relist_at) > Date.now()
    ? Math.round(Number(input.relist_at)) : null;
  // Acompte de réservation demandé (Ar → plus petite unité ; MGA = identité).
  const deposit_cents = input.deposit != null && Number.isFinite(Number(input.deposit)) && Number(input.deposit) > 0
    ? Math.max(0, toMinor(Number(input.deposit))) : null;
  const shop_id = (input.shop_id || '').trim() || null;
  const status = input.status === 'published' ? 'published' : 'draft';
  const lat = typeof input.lat === 'number' && Number.isFinite(input.lat) ? input.lat : null;
  const lng = typeof input.lng === 'number' && Number.isFinite(input.lng) ? input.lng : null;
  // Location par dates (calendrier) : Véhicules (jours) OU Immobilier (nuits, façon Airbnb).
  const rental = (category === 'Véhicules' || category === 'Immobilier') && !!input.rental ? 1 : 0;
  const driver_option = rental && ['with', 'without', 'both'].includes(String(input.driver_option))
    ? String(input.driver_option) : null;

  if (input.id) {
    const r = db.prepare(
      `UPDATE deposit_annonces SET shop_id = ?, title = ?, description = ?, category = ?, price_cents = ?, city = ?, image_url = ?, status = ?, lat = COALESCE(?, lat), lng = COALESCE(?, lng), rental = ?, driver_option = ?, attributes = ?, photos = ?, quantity = ?, relist_at = ?, deposit_cents = ?, updated_at = ?
        WHERE id = ? AND user_id = ?`
    ).run(shop_id, title, description, category, price_cents, city, image_url, status, lat, lng, rental, driver_option, attributes, photos, quantity, relist_at, deposit_cents, now, input.id, userId);
    if (r.changes === 0) return null;
    const saved = db.prepare('SELECT * FROM deposit_annonces WHERE id = ?').get(input.id) as DepositAnnonce;
    return writeAnnonceDotcard(db, saved);
  }

  const id = randomUUID();
  db.prepare(
    `INSERT INTO deposit_annonces (id, user_id, shop_id, title, description, category, price_cents, city, image_url, status, lat, lng, rental, driver_option, attributes, photos, quantity, relist_at, deposit_cents, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, userId, shop_id, title, description, category, price_cents, city, image_url, status, lat, lng, rental, driver_option, attributes, photos, quantity, relist_at, deposit_cents, now, now);
  const saved = db.prepare('SELECT * FROM deposit_annonces WHERE id = ?').get(id) as DepositAnnonce;
  return writeAnnonceDotcard(db, saved);
}

/**
 * Card OS : construit le `.card` de l'annonce (chaque champ → son rayon) et le STOCKE
 * (colonne dotcard). C'est la source de vérité que le lecteur Annonces lira via parseCard.
 * MGA (Ariary) : pas de centimes → l'unité mineure == le montant affiché.
 */
/** Construit le `.card` de l'annonce (sans l'écrire). null si la construction échoue. */
function buildAnnonceCard(r: DepositAnnonce) {
  try {
    let photos: string[] = [];
    try { photos = r.photos ? (JSON.parse(r.photos) as string[]) : []; } catch { /* */ }
    const images = photos.length ? photos : r.image_url ? [r.image_url] : [];
    let attrs: Record<string, string> = {};
    try { attrs = r.attributes ? (JSON.parse(r.attributes) as Record<string, string>) : {}; } catch { /* */ }
    const specs: Record<string, string> = { ...attrs };
    if (r.rental) specs['Location'] = 'oui';
    if (r.driver_option) specs['Chauffeur'] = r.driver_option;
    // Blocs métier TYPÉS (unification .card, comme `music`) : Automobile → `vehicle`, Immobilier →
    // `property`. Premier ordre dans la SuperCard (le lecteur unique s'en sert), en plus de `specs`.
    const pick = (keys: string[]): Record<string, string> => {
      const o: Record<string, string> = {};
      for (const k of keys) if (attrs[k] != null && String(attrs[k]).trim()) o[k] = String(attrs[k]);
      return o;
    };
    const vehicle = r.category === 'Véhicules'
      ? { ...pick(['type', 'marque', 'modele', 'annee', 'km', 'carburant', 'boite', 'places', 'etat']), ...(r.rental ? { rental: true } : {}), ...(r.driver_option ? { driver_option: r.driver_option } : {}) }
      : null;
    const property = r.category === 'Immobilier'
      ? { ...pick(['type', 'transaction', 'surface', 'pieces', 'chambres', 'meuble', 'etage']), ...(r.rental ? { rental: true } : {}) }
      : null;
    // Référent/apporteur : pointeur dénormalisé porté PAR le .card (source shop_referents, keyée sur l'id).
    let referent: { referent_id?: string; apporteur_id?: string } | null = null;
    try {
      const ref = getReferent(r.id); const app = getApporteur(r.id);
      if (ref || app) referent = { ...(ref ? { referent_id: ref.referent_id } : {}), ...(app ? { apporteur_id: app.referent_id } : {}) };
    } catch { /* referents best-effort */ }
    return makeCard({
      id: r.id,
      types: ['listing'],
      channel: 'annonce',
      title: r.title,
      state: r.status === 'published' ? 'published' : 'draft',
      ...(vehicle && Object.keys(vehicle).length ? { vehicle } : {}),
      ...(property && Object.keys(property).length ? { property } : {}),
      ...(referent ? { referent } : {}),
      ...(images.length ? { images } : {}),
      ...(r.description ? { text: { body: r.description } } : {}),
      ...(r.price_cents != null ? { price: { amount: r.price_cents, currency: 'MGA' } } : {}),
      ...(r.city ? { place: { address: r.city } } : {}),
      categories: [r.category],
      ...(Object.keys(specs).length ? { specs } : {}),
      ...(r.deposit_cents != null ? { deposit: { amount: r.deposit_cents, currency: 'MGA' } } : {}),
      ...(r.quantity != null ? { stock: r.quantity } : {}),
      actions: [
        { kind: 'contact', label: 'Contacter' },
        { kind: 'save', label: 'Enregistrer' },
      ],
    });
  } catch { /* la card est un bonus : si ça casse, l'annonce reste valide */ return null; }
}

function writeAnnonceDotcard(db: ReturnType<typeof db_>, r: DepositAnnonce): DepositAnnonce {
  const card = buildAnnonceCard(r);
  if (card) {
    const dotcard = serializeCard(card);
    db.prepare('UPDATE deposit_annonces SET dotcard = ? WHERE id = ?').run(dotcard, r.id);
    (r as DepositAnnonce & { dotcard?: string }).dotcard = dotcard;
    // Card OS à la CRÉATION : fichier .card best-effort différé (non bloquant).
    void saveToMoteur(card);
  }
  return r;
}

/** Propriétaire courant d'une annonce (user_id), ou null. */
export function getAnnonceOwner(id: string): string | null {
  const r = db_().prepare('SELECT user_id FROM deposit_annonces WHERE id = ?').get(id) as { user_id: string } | undefined;
  return r?.user_id ?? null;
}

/**
 * Recharge l'annonce et RÉÉCRIT son `.card` (colonne + FICHIER) — après changement de référent/propriété.
 * On ATTEND l'écriture du fichier (source de vérité) : pas de course, le lecteur voit l'état à jour.
 */
export async function refreshAnnonceCard(id: string): Promise<void> {
  const db = db_();
  const r = db.prepare('SELECT * FROM deposit_annonces WHERE id = ?').get(id) as DepositAnnonce | undefined;
  if (!r) return;
  const card = buildAnnonceCard(r);
  if (!card) return;
  const dotcard = serializeCard(card);
  db.prepare('UPDATE deposit_annonces SET dotcard = ? WHERE id = ?').run(dotcard, id);
  await saveToMoteur(card); // AWAIT : fichier .card à jour avant de rendre la main
}

/**
 * « Donner au client » : transfère la propriété de l'annonce (from → to). Le `.card` est rafraîchi
 * par l'appelant APRÈS la pose du référent (une seule réécriture, cf. /api/referents).
 */
export function transferAnnonceOwnership(id: string, fromUserId: string, toUserId: string): { ok: boolean; error?: string } {
  const db = db_();
  const row = db.prepare('SELECT user_id FROM deposit_annonces WHERE id = ?').get(id) as { user_id: string } | undefined;
  if (!row) return { ok: false, error: 'not_found' };
  if (row.user_id !== fromUserId) return { ok: false, error: 'not_owner' };
  if (toUserId === fromUserId) return { ok: false, error: 'invalid_client' };
  db.prepare('UPDATE deposit_annonces SET user_id = ?, updated_at = ? WHERE id = ?').run(toUserId, Date.now(), id);
  return { ok: true };
}

export function listMyAnnonces(userId: string): DepositAnnonce[] {
  ensure();
  return db_().prepare('SELECT * FROM deposit_annonces WHERE user_id = ? ORDER BY updated_at DESC').all(userId) as DepositAnnonce[];
}

/** Card OS : génère le `.card` de TOUTES les annonces sans (migration globale, idempotent). */
export function backfillAnnonceCards(): { converted: number } {
  ensure();
  const db = db_();
  let rows: DepositAnnonce[] = [];
  try { rows = db.prepare("SELECT * FROM deposit_annonces WHERE dotcard IS NULL OR dotcard = ''").all() as DepositAnnonce[]; } catch { return { converted: 0 }; }
  let converted = 0;
  for (const r of rows) { try { writeAnnonceDotcard(db, r); converted++; } catch { /* skip */ } }
  return { converted };
}

/**
 * Éditeur Card (Phase 2) : modifie les rayons d'une annonce, PROPRIÉTAIRE only.
 * Écrit la SOURCE (colonnes réelles) PUIS re-sérialise le `.card`. Le prix passe par
 * toMinor (validé), jamais un montant client de confiance.
 */
export function updateAnnonceFields(id: string, userId: string, patch: { text?: string; category?: string; price?: number; city?: string }): boolean {
  ensure();
  const db = db_();
  const row = db.prepare('SELECT id, user_id FROM deposit_annonces WHERE id = ? AND user_id = ?').get(id, userId) as { id: string } | undefined;
  if (!row) return false;
  const sets: string[] = []; const vals: (string | number | null)[] = [];
  if (patch.text !== undefined) { sets.push('description = ?'); vals.push(patch.text.trim().slice(0, 2000) || null); }
  if (patch.category !== undefined) { sets.push('category = ?'); vals.push(clampCat(patch.category)); }
  if (patch.city !== undefined) { sets.push('city = ?'); vals.push(patch.city.trim().slice(0, 80) || null); }
  if (patch.price !== undefined && Number.isFinite(Number(patch.price))) { sets.push('price_cents = ?'); vals.push(Math.max(0, toMinor(Number(patch.price)))); }
  if (!sets.length) return true;
  sets.push('updated_at = ?'); vals.push(Date.now());
  db.prepare(`UPDATE deposit_annonces SET ${sets.join(', ')} WHERE id = ?`).run(...vals, id);
  const saved = db.prepare('SELECT * FROM deposit_annonces WHERE id = ?').get(id) as DepositAnnonce;
  writeAnnonceDotcard(db, saved);
  return true;
}

/** Inspecteur (source-agnostique) : `.card` + méta d'une annonce par id. */
export function getAnnonceInspect(id: string): { user_id: string; created_at: number; dotcard: string | null } | null {
  ensure();
  try {
    return (db_().prepare('SELECT user_id, created_at, dotcard FROM deposit_annonces WHERE id = ?').get(id) as
      { user_id: string; created_at: number; dotcard: string | null } | undefined) || null;
  } catch { return null; }
}

/** Card OS diag : couverture `.card` des annonces (total vs avec dotcard). */
export function countAnnonceCards(): { total: number; withCard: number } {
  ensure();
  const g = (sql: string) => { try { return (db_().prepare(sql).get() as { c: number }).c; } catch { return 0; } };
  return { total: g('SELECT COUNT(*) c FROM deposit_annonces'), withCard: g("SELECT COUNT(*) c FROM deposit_annonces WHERE dotcard IS NOT NULL AND dotcard <> ''") };
}

/** Annonce par id pour l'ACHAT (prix + vendeur résolus côté serveur, jamais le client). */
export function getAnnonceForPurchase(id: string): { id: string; user_id: string; price_cents: number; title: string; status: string } | null {
  ensure();
  const r = db_().prepare('SELECT id, user_id, price_cents, title, status FROM deposit_annonces WHERE id = ?').get(id) as { id: string; user_id: string; price_cents: number; title: string; status: string } | undefined;
  return r || null;
}

export function deleteAnnonce(userId: string, id: string): boolean {
  ensure();
  return db_().prepare('DELETE FROM deposit_annonces WHERE id = ? AND user_id = ?').run(id, userId).changes > 0;
}

export interface PublicAnnonce {
  id: string; title: string; description: string | null; category: string;
  price_label: string | null; city: string | null; image_url: string | null;
  seller: { username: string; display_name: string | null } | null;
  shop_key: string | null; shop_name: string | null;
  rental?: boolean; driver_option?: string | null;
  photos?: string[] | null; attributes?: Record<string, string> | null;
  quantity?: number | null; boosted?: boolean;
  deposit_cents?: number | null; reserved?: boolean;
  dotcard?: string | null; // Card OS : `.card` stocké (source de vérité du lecteur)
}

/** Met une annonce EN VEDETTE jusqu'à untilMs (appelé après paiement PaPi du boost). */
export function setAnnonceBoosted(annonceId: string, untilMs: number): boolean {
  ensure();
  return db_().prepare('UPDATE deposit_annonces SET boosted_until = ?, updated_at = ? WHERE id = ?')
    .run(Math.round(untilMs), Date.now(), annonceId).changes > 0;
}

function jParseArr(v: unknown): string[] | null {
  if (typeof v !== 'string' || !v.trim()) return null;
  try { const o = JSON.parse(v); return Array.isArray(o) ? o.filter((x) => typeof x === 'string') : null; } catch { return null; }
}
function jParseObj(v: unknown): Record<string, string> | null {
  if (typeof v !== 'string' || !v.trim()) return null;
  try { const o = JSON.parse(v); return o && typeof o === 'object' && !Array.isArray(o) ? o : null; } catch { return null; }
}

function eur(c: number): string {
  return formatMoney(c);
}

/** Annonces PUBLIÉES (déposées via formulaire) groupées par catégorie. */
export function getPublishedAnnonces(opts: { category?: string; city?: string } = {}): PublicAnnonce[] {
  ensure();
  const where: string[] = ["status = 'published'"];
  const args: unknown[] = [];
  // Masquage auto : annonce occupée (relist_at futur) → hors feed jusqu'à sa remise en ligne.
  where.push('(relist_at IS NULL OR relist_at <= ?)'); args.push(Date.now());
  if (opts.category) { where.push('category = ?'); args.push(clampCat(opts.category)); }
  if (opts.city) { where.push('LOWER(city) = LOWER(?)'); args.push(opts.city.trim()); }
  // Annonces depuis annonces.db (AUCUN JOIN inter-base). seller/boutique résolus par ID.
  // Tri : annonces EN VEDETTE (boost payé, encore valide) d'abord, puis les plus récentes.
  args.push(Date.now());
  const rows = db_().prepare(
    `SELECT * FROM deposit_annonces WHERE ${where.join(' AND ')}
      ORDER BY (CASE WHEN boosted_until IS NOT NULL AND boosted_until > ? THEN 0 ELSE 1 END), created_at DESC LIMIT 200`
  ).all(...args) as DepositAnnonce[];
  const fromDeposit: PublicAnnonce[] = rows.map((r) => {
    // Card OS : auto-migration paresseuse — une vieille annonce sans `.card` le génère
    // et le stocke à la 1re lecture (idempotent, plus aucune annonce sans `.card` ensuite).
    if (!(r as DepositAnnonce & { dotcard?: string | null }).dotcard) {
      try { writeAnnonceDotcard(db_(), r); } catch { /* */ }
    }
    let seller: { username: string; display_name: string | null } | null = null;
    try { const u = getUserById(r.user_id); if (u) seller = { username: u.username, display_name: u.display_name ?? null }; } catch { /* */ }
    let shop_key: string | null = null, shop_name: string | null = null;
    if (r.shop_id) { try { const s = getSimpleShop(r.shop_id); if (s) { shop_key = s.public_key; shop_name = s.name; } } catch { /* */ } }
    return {
      id: r.id, title: r.title, description: r.description, category: r.category,
      price_label: typeof r.price_cents === 'number' ? eur(r.price_cents) : null,
      city: r.city, image_url: r.image_url, seller, shop_key, shop_name,
      rental: !!r.rental, driver_option: r.driver_option ?? null,
      photos: jParseArr(r.photos), attributes: jParseObj(r.attributes),
      quantity: typeof r.quantity === 'number' ? r.quantity : null,
      boosted: typeof r.boosted_until === 'number' && r.boosted_until > Date.now(),
      deposit_cents: typeof r.deposit_cents === 'number' ? r.deposit_cents : null,
      reserved: typeof r.reserved_until === 'number' && r.reserved_until > Date.now(),
      dotcard: (r as DepositAnnonce & { dotcard?: string | null }).dotcard ?? null,
    };
  });

  // + Articles de boutique badgés « annonce » (source = le flag annonce_on, pas de
  // duplication). C'est ce qui faisait que l'article badgé n'apparaissait PAS ici.
  let fromItems: PublicAnnonce[] = [];
  try {
    fromItems = listAnnonceItems({ category: opts.category, city: opts.city }).map((it) => {
      let seller: { username: string; display_name: string | null } | null = null;
      try { const u = getUserById(it.owner_id); if (u) seller = { username: u.username, display_name: u.display_name ?? null }; } catch { /* */ }
      return {
        id: it.id, title: it.title, description: it.description, category: it.category,
        price_label: typeof it.price_cents === 'number' ? eur(it.price_cents) : null,
        city: it.city, image_url: it.image_url, seller, shop_key: it.shop_key, shop_name: it.shop_name,
        photos: jParseArr((it as { photos?: string | null }).photos), attributes: jParseObj((it as { attributes?: string | null }).attributes),
        quantity: typeof (it as { quantity?: number | null }).quantity === 'number' ? (it as { quantity?: number | null }).quantity : null,
      };
    });
  } catch { /* base boutique indispo : on renvoie au moins les annonces déposées */ }

  return [...fromItems, ...fromDeposit];
}

/** Talk2Me — Location de véhicules pour DRIVE (Pascal 2026-06-26).
 *  Annonces Véhicules publiées flaguées `rental=1`. Prix = par jour. Vendeur résolu par ID. */
export interface RentalVehicle {
  id: string; title: string; description: string | null;
  price_label: string | null; city: string | null; image_url: string | null;
  type: string | null; // attributes.type (Voiture/Moto/Scooter/…) — filtre catégorie du feed
  driver_option: string | null; // 'with' | 'without' | 'both'
  owner_id: string;
  lat: number | null; lng: number | null; // proximité (tri par distance côté API)
  seller: { username: string; display_name: string | null } | null;
  dotcard: string | null; // Card OS : le `.card` stocké (le lecteur SuperCard le lit via parseCard)
}
export function getRentalVehicles(opts: { city?: string } = {}): RentalVehicle[] {
  ensure();
  const where: string[] = ["status = 'published'", 'rental = 1', "category = 'Véhicules'"];
  const args: unknown[] = [];
  if (opts.city) { where.push('LOWER(city) = LOWER(?)'); args.push(opts.city.trim()); }
  const rows = db_().prepare(
    `SELECT * FROM deposit_annonces WHERE ${where.join(' AND ')} ORDER BY created_at DESC LIMIT 200`
  ).all(...args) as DepositAnnonce[];
  return rows.map((r) => {
    let seller: { username: string; display_name: string | null } | null = null;
    try { const u = getUserById(r.user_id); if (u) seller = { username: u.username, display_name: u.display_name ?? null }; } catch { /* */ }
    return {
      id: r.id, title: r.title, description: r.description,
      price_label: typeof r.price_cents === 'number' ? eur(r.price_cents) : null,
      city: r.city, image_url: r.image_url,
      type: jParseObj(r.attributes)?.type ?? null,
      driver_option: r.driver_option ?? null,
      owner_id: r.user_id,
      lat: typeof r.lat === 'number' ? r.lat : null, lng: typeof r.lng === 'number' ? r.lng : null,
      seller,
      dotcard: r.dotcard ?? null,
    };
  });
}

/** Talk2Me — Filtre « Autour » (Pascal 2026-07-05). Toutes les annonces PUBLIÉES géolocalisées
 *  (lat/lng non nuls, toutes catégories) dans un RAYON autour de la position user, TRIÉES du plus
 *  proche au plus loin. Le rendu passe par le lecteur SuperCard via le `.card` stocké (dotcard).
 *  Distance haversine calculée côté serveur. PII air-gap : jamais owner_id/tel, seul le vendeur
 *  (username/display_name) est exposé. */
function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371; // rayon terrestre moyen (km)
  const dLat = toRad(bLat - aLat), dLng = toRad(bLng - aLng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

export interface NearAnnonce {
  id: string; title: string; category: string;
  price_label: string | null; city: string | null; image_url: string | null;
  distance_km: number; // distance à la position user (km), arrondie à 0,1
  seller: { username: string; display_name: string | null } | null;
  dotcard: string | null; // Card OS : le `.card` stocké (le lecteur SuperCard le lit via parseCard)
}

/** Annonces publiées géolocalisées dans `radiusKm` autour de (lat,lng), triées par distance. */
export function getAnnoncesNear(opts: { lat: number; lng: number; radiusKm: number }): NearAnnonce[] {
  ensure();
  if (!Number.isFinite(opts.lat) || !Number.isFinite(opts.lng)) return [];
  const radius = Number.isFinite(opts.radiusKm) && opts.radiusKm > 0 ? opts.radiusKm : 1;
  // Masquage auto (relist_at futur) respecté, comme le feed annonces. Toutes catégories.
  const rows = db_().prepare(
    `SELECT * FROM deposit_annonces
      WHERE status = 'published' AND lat IS NOT NULL AND lng IS NOT NULL
        AND (relist_at IS NULL OR relist_at <= ?)
      LIMIT 500`
  ).all(Date.now()) as DepositAnnonce[];
  const out: NearAnnonce[] = [];
  for (const r of rows) {
    if (typeof r.lat !== 'number' || typeof r.lng !== 'number') continue;
    const d = haversineKm(opts.lat, opts.lng, r.lat, r.lng);
    if (d > radius) continue;
    // Card OS : auto-migration paresseuse — une vieille annonce sans `.card` le génère ici.
    if (!(r as DepositAnnonce & { dotcard?: string | null }).dotcard) {
      try { writeAnnonceDotcard(db_(), r); } catch { /* */ }
    }
    let seller: { username: string; display_name: string | null } | null = null;
    try { const u = getUserById(r.user_id); if (u) seller = { username: u.username, display_name: u.display_name ?? null }; } catch { /* */ }
    out.push({
      id: r.id, title: r.title, category: r.category,
      price_label: typeof r.price_cents === 'number' ? eur(r.price_cents) : null,
      city: r.city, image_url: r.image_url,
      distance_km: Math.round(d * 10) / 10,
      seller,
      dotcard: (r as DepositAnnonce & { dotcard?: string | null }).dotcard ?? null,
    });
  }
  out.sort((a, b) => a.distance_km - b.distance_km);
  return out;
}

/** Talk2Me — Immobilier à LOUER pour le Hub (Pascal 2026-07-05). Clone de getRentalVehicles.
 *  Annonces Immobilier publiées flaguées `rental=1` (location par nuits/mois, façon Airbnb).
 *  L'immobilier partage le flag `rental` (upsertAnnonce) : on filtre donc la LOCATION seule
 *  — cohérent avec l'onglet « biens à louer ». Prix = par mois. Vendeur résolu par ID.
 *  PII air-gap : jamais owner_id/tel exposé au client, seulement username/display_name. */
export interface RealEstateListing {
  id: string; title: string; description: string | null;
  price_label: string | null; city: string | null; image_url: string | null;
  type: string | null; // attributes.type (Appartement/Maison/Studio/…) — filtre catégorie du feed
  owner_id: string;
  lat: number | null; lng: number | null; // proximité (tri par distance côté API)
  seller: { username: string; display_name: string | null } | null;
  dotcard: string | null; // Card OS : le `.card` stocké (le lecteur SuperCard le lit via parseCard)
}
export function getRealEstateListings(opts: { city?: string } = {}): RealEstateListing[] {
  ensure();
  const where: string[] = ["status = 'published'", 'rental = 1', "category = 'Immobilier'"];
  const args: unknown[] = [];
  if (opts.city) { where.push('LOWER(city) = LOWER(?)'); args.push(opts.city.trim()); }
  const rows = db_().prepare(
    `SELECT * FROM deposit_annonces WHERE ${where.join(' AND ')} ORDER BY created_at DESC LIMIT 200`
  ).all(...args) as DepositAnnonce[];
  return rows.map((r) => {
    let seller: { username: string; display_name: string | null } | null = null;
    try { const u = getUserById(r.user_id); if (u) seller = { username: u.username, display_name: u.display_name ?? null }; } catch { /* */ }
    return {
      id: r.id, title: r.title, description: r.description,
      price_label: typeof r.price_cents === 'number' ? eur(r.price_cents) : null,
      city: r.city, image_url: r.image_url,
      type: jParseObj(r.attributes)?.type ?? null,
      owner_id: r.user_id,
      lat: typeof r.lat === 'number' ? r.lat : null, lng: typeof r.lng === 'number' ? r.lng : null,
      seller,
      dotcard: r.dotcard ?? null,
    };
  });
}
