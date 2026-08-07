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
// PÉRIMÈTRE = les services « terrain » où un contributeur apporte de la valeur (recruter/aider
// de VRAIS tiers, servir une boutique) + Communication (croissance du réseau). BOUTIQUE ajoutée
// (Pascal 2026-07-30) : une boutique est une .card, un contributeur en est le RÉFÉRENT (rail
// shop_referents, referents.ts) → ses ventes remontent dans le MÊME moteur/split que le reste.
// Plats/Dropship/Composer = encore self-serve. Voyage/Hôtels = AirBizness, hors T2M.
const SERVICES: Array<{ code: string; label: string; icon: string }> = [
  { code: 'restaurants', label: 'Restaurants / Eat', icon: '🍽️' },
  { code: 'boutiques', label: 'Boutiques', icon: '🛍️' },
  { code: 'transport', label: 'Transport', icon: '🛵' },
  { code: 'annonces', label: 'Petites annonces', icon: '📢' },
  { code: 'communication', label: 'Communication (réseau)', icon: '💬' },
];

// family : recruit (amener un humain) · enrich (créer/remplir) · generate (transaction qui paie)
// RÉMUNÉRATION (Pascal 2026-07-30 — modèle UNIQUE, multi-pays → QUE des pourcentages) :
//   - recruit / enrich : 0 cash immédiat, mais RATTACHE le contributeur à l'actif
//     (resto/chauffeur/annonce/boutique) + donne des POINTS (échelons).
//   - generate (transaction réelle) : sur NOS 3% de commission plateforme, on redistribue 1%
//     dans la chaîne — contributeur rattaché 0,75% + parrain 0,15% + grand-parrain 0,10% de la
//     VENTE ; on garde 2%. Les taux sont réglables admin (app-settings : field_*_rate). L'override
//     s'arrête au grand-parrain (2 crans, Pascal : « faut bien s'arrêter »). JAMAIS à perte
//     (somme terrain 1% < commission 3%). commission_value ci-dessous n'est plus utilisé pour le
//     cash (piloté par les taux globaux) — laissé à 0 ; seuls les `points` comptent ici.
// commission_kind : 'fixed' (centimes — on n'en met PLUS, multi-pays) · 'pct' (points de base, 1%=100)
type Fam = 'recruit' | 'enrich' | 'generate';
const TYPES: Array<{ code: string; service: string; family: Fam; label: string; kind: 'fixed' | 'pct'; value: number; points: number }> = [
  // ── Restaurants ──
  { code: 'resto_recruit_owner', service: 'restaurants', family: 'recruit', label: 'Recruter le restaurateur', kind: 'fixed', value: 0, points: 10 },
  { code: 'resto_claim', service: 'restaurants', family: 'enrich', label: 'Revendiquer / créer la fiche resto', kind: 'fixed', value: 0, points: 5 },
  { code: 'resto_geo', service: 'restaurants', family: 'enrich', label: 'Géolocaliser / corriger l’adresse', kind: 'fixed', value: 0, points: 3 },
  { code: 'resto_fill', service: 'restaurants', family: 'enrich', label: 'Menu, prix, photos', kind: 'fixed', value: 0, points: 5 },
  { code: 'resto_client', service: 'restaurants', family: 'generate', label: 'Commande sur le resto rattaché', kind: 'pct', value: 0, points: 2 },
  // ── Boutiques (.card servie par un contributeur-référent, rail shop_referents) ──
  { code: 'boutique_referent', service: 'boutiques', family: 'enrich', label: 'Devenir référent d’une boutique (.card)', kind: 'fixed', value: 0, points: 5 },
  { code: 'boutique_sale', service: 'boutiques', family: 'generate', label: 'Vente sur la boutique rattachée', kind: 'pct', value: 0, points: 2 },
  // ── Transport ──
  { code: 'driver_recruit', service: 'transport', family: 'recruit', label: 'Recruter un chauffeur (taxi/moto/tuk-tuk)', kind: 'fixed', value: 0, points: 10 },
  { code: 'driver_profile', service: 'transport', family: 'enrich', label: 'Compléter le profil chauffeur', kind: 'fixed', value: 0, points: 5 },
  { code: 'ride_done', service: 'transport', family: 'generate', label: 'Course réalisée', kind: 'pct', value: 0, points: 2 },
  // ── Petites annonces ──
  { code: 'annonce_help', service: 'annonces', family: 'enrich', label: 'Aider une personne à déposer son annonce', kind: 'fixed', value: 0, points: 5 },
  { code: 'annonce_sale', service: 'annonces', family: 'generate', label: 'Annonce → vente / mise en relation', kind: 'pct', value: 0, points: 2 },
  // ── Communication / Croissance réseau ──
  { code: 'user_referral', service: 'communication', family: 'recruit', label: 'Parrainer un nouvel utilisateur', kind: 'fixed', value: 0, points: 5 },
  { code: 'contributor_recruit', service: 'communication', family: 'recruit', label: 'Recruter un contributeur (downline)', kind: 'fixed', value: 0, points: 10 },
  { code: 'zone_animation', service: 'communication', family: 'generate', label: 'Animer une zone (posts/stories → trafic)', kind: 'fixed', value: 0, points: 2 },
  // ── Parrainage relationnel des FICHES (Pascal 2026-08-05) : gérer/donner la fiche d'autrui ──
  { code: 'client_onboard', service: 'communication', family: 'recruit', label: 'Donner une fiche à un client (transfert)', kind: 'fixed', value: 0, points: 10 },
  { code: 'resto_referent', service: 'restaurants', family: 'enrich', label: 'Devenir référent d’un resto / plat maison', kind: 'fixed', value: 0, points: 5 },
  { code: 'annonce_referent', service: 'annonces', family: 'enrich', label: 'Devenir référent d’une annonce (service / emploi)', kind: 'fixed', value: 0, points: 5 },
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

  // ── SEED AUTORITAIRE : le catalogue (services + types) est défini DANS LE CODE.
  // On UPSERT (le code prime) puis on PURGE ce qui n'est plus au catalogue, pour
  // que la base reflète exactement le périmètre validé (Resto/Transport/Annonces/Comm).
  const sSvc = db.prepare(`INSERT INTO services (code,label,icon,position,active) VALUES (?,?,?,?,1)
    ON CONFLICT(code) DO UPDATE SET label=excluded.label, icon=excluded.icon, position=excluded.position, active=1`);
  SERVICES.forEach((s, i) => sSvc.run(s.code, s.label, s.icon, i));
  const svcCodes = SERVICES.map((s) => s.code);
  db.prepare(`DELETE FROM services WHERE code NOT IN (${svcCodes.map(() => '?').join(',')})`).run(...svcCodes);

  const sType = db.prepare(`INSERT INTO contribution_types (code,service,family,label,commission_kind,commission_value,points,active)
    VALUES (?,?,?,?,?,?,?,1)
    ON CONFLICT(code) DO UPDATE SET service=excluded.service, family=excluded.family, label=excluded.label,
      commission_kind=excluded.commission_kind, commission_value=excluded.commission_value, points=excluded.points, active=1`);
  for (const t of TYPES) sType.run(t.code, t.service, t.family, t.label, t.kind, t.value, t.points);
  const typeCodes = TYPES.map((t) => t.code);
  db.prepare(`DELETE FROM contribution_types WHERE code NOT IN (${typeCodes.map(() => '?').join(',')})`).run(...typeCodes);

  // Échelons : INSERT OR IGNORE (DYNAMIQUES — éditables par admin, on n'écrase pas).
  const sLvl = db.prepare('INSERT OR IGNORE INTO contributor_levels (rank,name,min_perso,min_network,min_recruits,override_pct,territory_max) VALUES (?,?,?,?,?,?,?)');
  for (const l of LEVELS) sLvl.run(l.rank, l.name, l.min_perso, l.min_network, l.min_recruits, l.override_pct, l.territory_max);

  return db;
}
