import 'server-only';

/**
 * Talk2Me — ORGANISATION INTERNE / RÉSEAU DE CONTRIBUTEURS (Pascal 2026-06-20).
 * « Utiliser Talk2Me pour développer Talk2Me. » Modèle BOTTOM-UP méritocratique :
 * tout user peut devenir contributeur, contribue concrètement, gagne, recrute
 * (downline → override), et MONTE automatiquement les échelons selon ses scores.
 *
 * Base SÉPARÉE (network.db), portable. Liens vers users/commerces par ID (pas de
 * JOIN inter-base). Tout est DYNAMIQUE (services, types de contribution, échelons
 * éditables par le Super Admin sans toucher au code — cf. doctrine roles via DB).
 *
 * Path : env TALKTOME_NETWORK_DB_PATH, sinon network.db à côté de la base principale.
 */
import Database from 'better-sqlite3';
import path from 'path';

let db: Database.Database | null = null;
function mainDbPath() { return process.env.TALKTOME_DB_PATH || process.cwd() + '/data/talktome.db'; }

// ── Catalogue VALIDÉ (Pascal 2026-06-20) ────────────────────────────────────
// 12 services = unités d'organisation (= les services produit).
const SERVICES: Array<{ code: string; label: string; icon: string }> = [
  { code: 'communication', label: 'Communication', icon: '💬' },
  { code: 'restaurants', label: 'Restaurants / Eat', icon: '🍽️' },
  { code: 'boutique', label: 'Boutique', icon: '🛍️' },
  { code: 'plats_maison', label: 'Plats maison', icon: '🍲' },
  { code: 'annonces', label: 'Petites annonces', icon: '📢' },
  { code: 'transport', label: 'Transport', icon: '🛵' },
  { code: 'livraison', label: 'Livraison / Distribution', icon: '📦' },
  { code: 'dropship_affiliation', label: 'Dropshipping / Affiliation', icon: '🔗' },
  { code: 'services_locaux', label: 'Services locaux / Métiers', icon: '🧰' },
  { code: 'voyage', label: 'Voyage / Hôtels', icon: '✈️' },
  { code: 'paiement_wallet', label: 'Paiement / Wallet', icon: '💰' },
  { code: 'ia_composer', label: 'IA / Composer', icon: '🤖' },
];

// family : recruit (amener un humain) · enrich (créer/remplir) · generate (événement qui paie)
// commission_kind : 'fixed' (prime en centimes) · 'pct' (pourcentage de value_cents, en points de base 1%=100)
type Fam = 'recruit' | 'enrich' | 'generate';
const TYPES: Array<{ code: string; service: string; family: Fam; label: string; kind: 'fixed' | 'pct'; value: number }> = [
  // Restaurants
  { code: 'resto_claim', service: 'restaurants', family: 'enrich', label: 'Revendiquer une fiche resto (OSM→T2M)', kind: 'fixed', value: 0 },
  { code: 'resto_geo', service: 'restaurants', family: 'enrich', label: 'Géolocaliser / corriger l’adresse', kind: 'fixed', value: 0 },
  { code: 'resto_fill', service: 'restaurants', family: 'enrich', label: 'Remplir/enrichir la fiche (photos, menu, prix)', kind: 'fixed', value: 0 },
  { code: 'resto_polish', service: 'restaurants', family: 'enrich', label: 'Rendre la carte attractive (photos)', kind: 'fixed', value: 0 },
  { code: 'resto_client', service: 'restaurants', family: 'generate', label: 'Ramener un client (post → commande)', kind: 'pct', value: 0 },
  { code: 'resto_recruit_owner', service: 'restaurants', family: 'recruit', label: 'Recruter le restaurateur', kind: 'fixed', value: 0 },
  // Boutique
  { code: 'shop_create', service: 'boutique', family: 'enrich', label: 'Monter la boutique d’un commerçant', kind: 'fixed', value: 0 },
  { code: 'shop_fill', service: 'boutique', family: 'enrich', label: 'Remplir le catalogue (articles, photos, prix)', kind: 'fixed', value: 0 },
  { code: 'shop_vitrine', service: 'boutique', family: 'enrich', label: 'Publier la vitrine 3D', kind: 'fixed', value: 0 },
  { code: 'shop_buyer', service: 'boutique', family: 'generate', label: 'Ramener un acheteur (vente)', kind: 'pct', value: 0 },
  { code: 'shop_recruit_owner', service: 'boutique', family: 'recruit', label: 'Recruter le commerçant', kind: 'fixed', value: 0 },
  // Plats maison
  { code: 'plat_publish', service: 'plats_maison', family: 'enrich', label: 'Aider à publier ses plats', kind: 'fixed', value: 0 },
  { code: 'plat_geo', service: 'plats_maison', family: 'enrich', label: 'Géolocaliser (visibilité 500 m)', kind: 'fixed', value: 0 },
  { code: 'plat_recruit_cook', service: 'plats_maison', family: 'recruit', label: 'Recruter un cuisinier de quartier', kind: 'fixed', value: 0 },
  { code: 'plat_sale', service: 'plats_maison', family: 'generate', label: 'Plat vendu', kind: 'pct', value: 0 },
  // Petites annonces
  { code: 'annonce_help', service: 'annonces', family: 'enrich', label: 'Aider à déposer une annonce', kind: 'fixed', value: 0 },
  { code: 'annonce_sale', service: 'annonces', family: 'generate', label: 'Annonce → vente / mise en relation', kind: 'pct', value: 0 },
  // Transport
  { code: 'driver_recruit', service: 'transport', family: 'recruit', label: 'Recruter un chauffeur (taxi/moto/tuk-tuk)', kind: 'fixed', value: 0 },
  { code: 'driver_profile', service: 'transport', family: 'enrich', label: 'Compléter le profil chauffeur', kind: 'fixed', value: 0 },
  { code: 'ride_done', service: 'transport', family: 'generate', label: 'Course réalisée', kind: 'pct', value: 0 },
  // Livraison / Distribution
  { code: 'courier_recruit', service: 'livraison', family: 'recruit', label: 'Recruter un livreur', kind: 'fixed', value: 0 },
  { code: 'delivery_done', service: 'livraison', family: 'generate', label: 'Livraison effectuée', kind: 'pct', value: 0 },
  { code: 'parcel_match', service: 'livraison', family: 'generate', label: 'Mise en relation transport d’objets', kind: 'pct', value: 0 },
  // Dropshipping / Affiliation
  { code: 'dropship_setup', service: 'dropship_affiliation', family: 'enrich', label: 'Monter une boutique dropship', kind: 'fixed', value: 0 },
  { code: 'product_promote', service: 'dropship_affiliation', family: 'generate', label: 'Promouvoir un produit (partage → vente)', kind: 'pct', value: 0 },
  { code: 'affiliate_sale', service: 'dropship_affiliation', family: 'generate', label: 'Vente d’affiliation attribuée', kind: 'pct', value: 0 },
  // Services locaux / Métiers
  { code: 'pro_recruit', service: 'services_locaux', family: 'recruit', label: 'Recruter un artisan/pro', kind: 'fixed', value: 0 },
  { code: 'pro_profile', service: 'services_locaux', family: 'enrich', label: 'Remplir la fiche service', kind: 'fixed', value: 0 },
  { code: 'pro_match', service: 'services_locaux', family: 'generate', label: 'Mise en relation client ↔ pro', kind: 'pct', value: 0 },
  // Voyage / Hôtels
  { code: 'lodging_list', service: 'voyage', family: 'enrich', label: 'Référencer un hôtel / chambre d’hôte', kind: 'fixed', value: 0 },
  { code: 'booking_done', service: 'voyage', family: 'generate', label: 'Réservation aboutie', kind: 'pct', value: 0 },
  // Communication / Croissance réseau
  { code: 'user_referral', service: 'communication', family: 'recruit', label: 'Parrainer un nouvel utilisateur', kind: 'fixed', value: 0 },
  { code: 'contributor_recruit', service: 'communication', family: 'recruit', label: 'Recruter un contributeur (downline)', kind: 'fixed', value: 0 },
  { code: 'zone_animation', service: 'communication', family: 'generate', label: 'Animer une zone (posts/stories → trafic)', kind: 'fixed', value: 0 },
  // IA / Composer
  { code: 'content_produced', service: 'ia_composer', family: 'enrich', label: 'Produire du contenu (reels/cards)', kind: 'fixed', value: 0 },
];

// Échelons par défaut (DYNAMIQUES, éditables). Seuils = placeholders à calibrer.
const LEVELS: Array<{ rank: number; name: string; min_perso: number; min_network: number; min_recruits: number; override_pct: number; territory_max: string }> = [
  { rank: 1, name: 'Contributeur', min_perso: 0, min_network: 0, min_recruits: 0, override_pct: 0, territory_max: 'quartier' },
  { rank: 2, name: 'Délégué', min_perso: 50, min_network: 0, min_recruits: 0, override_pct: 5, territory_max: 'ville' },
  { rank: 3, name: 'Chef de zone', min_perso: 150, min_network: 300, min_recruits: 3, override_pct: 7, territory_max: 'ville' },
  { rank: 4, name: 'Chef régional', min_perso: 300, min_network: 1500, min_recruits: 10, override_pct: 10, territory_max: 'region' },
  { rank: 5, name: 'Chef national', min_perso: 500, min_network: 6000, min_recruits: 30, override_pct: 12, territory_max: 'pays' },
];

export function getNetworkDb(): Database.Database {
  if (db) return db;
  const p = process.env.TALKTOME_NETWORK_DB_PATH || path.join(path.dirname(mainDbPath()), 'network.db');
  db = new Database(p);
  db.pragma('journal_mode = WAL');
  db.exec(`
    -- Contributeurs : tout user peut le devenir. sponsor_id = chaîne de parrainage (downline).
    CREATE TABLE IF NOT EXISTS contributors (
      user_id TEXT PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'active',          -- active | paused | banned
      sponsor_id TEXT,                                 -- qui l'a recruté (NULL = racine)
      level_rank INTEGER NOT NULL DEFAULT 1,           -- calculé par le moteur de promotion
      country TEXT, region TEXT, city TEXT, quartier TEXT,
      personal_score INTEGER NOT NULL DEFAULT 0,
      network_score INTEGER NOT NULL DEFAULT 0,
      recruits_count INTEGER NOT NULL DEFAULT 0,
      joined_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_contrib_sponsor ON contributors(sponsor_id);

    -- Services (unités d'organisation) — éditables.
    CREATE TABLE IF NOT EXISTS services (
      code TEXT PRIMARY KEY, label TEXT NOT NULL, icon TEXT, active INTEGER NOT NULL DEFAULT 1, position INTEGER DEFAULT 0
    );

    -- Types de contribution (catalogue) — DYNAMIQUE, le Super Admin peut ajouter/éditer.
    CREATE TABLE IF NOT EXISTS contribution_types (
      code TEXT PRIMARY KEY,
      service TEXT NOT NULL,                            -- FK logique services.code
      family TEXT NOT NULL,                             -- recruit | enrich | generate
      label TEXT NOT NULL,
      commission_kind TEXT NOT NULL DEFAULT 'fixed',    -- fixed (centimes) | pct (points de base)
      commission_value INTEGER NOT NULL DEFAULT 0,
      points INTEGER NOT NULL DEFAULT 1,                -- score gagné (alimente promotion)
      active INTEGER NOT NULL DEFAULT 1
    );
    CREATE INDEX IF NOT EXISTS idx_ctype_service ON contribution_types(service);

    -- Journal des contributions (LE trésor : chaque action utile tracée).
    CREATE TABLE IF NOT EXISTS contributions (
      id TEXT PRIMARY KEY,
      contributor_id TEXT NOT NULL,
      type_code TEXT NOT NULL,
      service TEXT NOT NULL,
      target_id TEXT,                                  -- resto/boutique/driver/user… concerné (par ID)
      target_label TEXT,
      value_cents INTEGER DEFAULT 0,                   -- montant généré (pour les 'generate')
      commission_cents INTEGER DEFAULT 0,             -- part du contributeur
      country TEXT, region TEXT, city TEXT, quartier TEXT,
      status TEXT NOT NULL DEFAULT 'confirmed',        -- pending | confirmed | rejected
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_contributions_who ON contributions(contributor_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_contributions_type ON contributions(type_code);
    CREATE INDEX IF NOT EXISTS idx_contributions_target ON contributions(target_id);

    -- Échelons (DYNAMIQUES).
    CREATE TABLE IF NOT EXISTS contributor_levels (
      rank INTEGER PRIMARY KEY, name TEXT NOT NULL,
      min_perso INTEGER NOT NULL DEFAULT 0, min_network INTEGER NOT NULL DEFAULT 0, min_recruits INTEGER NOT NULL DEFAULT 0,
      override_pct INTEGER NOT NULL DEFAULT 0,          -- % sur le réseau
      territory_max TEXT NOT NULL DEFAULT 'quartier'
    );

    -- Historique des promotions (traçabilité).
    CREATE TABLE IF NOT EXISTS contributor_promotions (
      id TEXT PRIMARY KEY, contributor_id TEXT NOT NULL, from_rank INTEGER, to_rank INTEGER,
      reason TEXT, by_admin TEXT, created_at INTEGER NOT NULL
    );

    -- Ledger commissions (perso + override réseau) → alimente le Wallet.
    CREATE TABLE IF NOT EXISTS contributor_commissions (
      id TEXT PRIMARY KEY, contributor_id TEXT NOT NULL,
      source TEXT NOT NULL,                             -- personal | override
      from_contributor_id TEXT,                         -- si override : qui a généré
      contribution_id TEXT, amount_cents INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',           -- pending | paid
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_commissions_who ON contributor_commissions(contributor_id, created_at DESC);
    -- NB : la couche ACCÈS (droits/permissions, super-admin) reste lib/permissions.ts
    -- (table user_permissions). network.db = UNIQUEMENT la carrière/économie (pas de RBAC ici).
  `);

  // ── SEED idempotent (INSERT OR IGNORE) ──
  const sSvc = db.prepare('INSERT OR IGNORE INTO services (code,label,icon,position) VALUES (?,?,?,?)');
  SERVICES.forEach((s, i) => sSvc.run(s.code, s.label, s.icon, i));
  const sType = db.prepare('INSERT OR IGNORE INTO contribution_types (code,service,family,label,commission_kind,commission_value) VALUES (?,?,?,?,?,?)');
  for (const t of TYPES) sType.run(t.code, t.service, t.family, t.label, t.kind, t.value);
  const sLvl = db.prepare('INSERT OR IGNORE INTO contributor_levels (rank,name,min_perso,min_network,min_recruits,override_pct,territory_max) VALUES (?,?,?,?,?,?,?)');
  for (const l of LEVELS) sLvl.run(l.rank, l.name, l.min_perso, l.min_network, l.min_recruits, l.override_pct, l.territory_max);

  return db;
}
