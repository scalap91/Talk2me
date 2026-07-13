import 'server-only';

/**
 * Talk2Me — Réglages globaux de l'app (KV simple, base principale).
 * Sert aux interrupteurs côté Super-Admin (ex : activer/désactiver le Shop).
 * Pas de RBAC ici : la couche accès reste lib/permissions.ts.
 */
import { getDb } from '@/lib/db';

let ensured = false;
function ensure() {
  if (ensured) return;
  getDb().exec(`CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT, updated_at INTEGER)`);
  ensured = true;
}

export function getSetting(key: string, def: string): string {
  ensure();
  const r = getDb().prepare('SELECT value FROM app_settings WHERE key = ?').get(key) as { value: string } | undefined;
  return r?.value ?? def;
}

export function setSetting(key: string, value: string): void {
  ensure();
  getDb()
    .prepare('INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at')
    .run(key, value, Date.now());
}

// ── Sous-sections du Shop ON/OFF (Pascal 2026-06-21) ──
// L'icône Shop reste TOUJOURS ; on active/désactive chaque sous-partie séparément.
export type ShopSection = 'eat' | 'annonces' | 'boutique' | 'service' | 'emploi' | 'location' | 'immobilier';
const SHOP_KEYS: Record<ShopSection, string> = {
  eat: 'eat_enabled',
  annonces: 'annonces_enabled',
  boutique: 'boutique_enabled',
  // Annonces locales « listing + action chat » (Pascal 2026-07-05). ON par défaut.
  service: 'service_enabled',
  emploi: 'emploi_enabled',
  // Location de véhicules (onglet Hub, tri par proximité). ON par défaut.
  location: 'location_enabled',
  // Immobilier à louer (onglet Hub, tri par proximité). ON par défaut.
  immobilier: 'immobilier_enabled',
};
export function isShopSectionEnabled(section: ShopSection): boolean {
  return getSetting(SHOP_KEYS[section], '1') === '1';
}
export function setShopSectionEnabled(section: ShopSection, on: boolean): void {
  setSetting(SHOP_KEYS[section], on ? '1' : '0');
}

// ── TAUX DE COMMISSION réglables par l'ADMIN (Pascal 2026-07-09) ──
// Plus de constantes en dur : toutes les commissions se fixent depuis l'admin.
export type CommissionKey = 'platform_commission_rate' | 'affiliate_share_rate' | 'papi_fee_rate';
export const COMMISSION_DEFAULTS: Record<CommissionKey, number> = {
  platform_commission_rate: 0.03, // NOTRE marge sur chaque vente (3%)
  affiliate_share_rate: 0.10,     // part du promoteur SUR notre marge (10% de nos 3%)
  papi_fee_rate: 0.038,           // frais PaPi Transit (MVola ~3,8%)
};
export const COMMISSION_LABELS: Record<CommissionKey, string> = {
  platform_commission_rate: 'Commission plateforme T2M',
  affiliate_share_rate: 'Part promoteur (sur notre marge)',
  papi_fee_rate: 'Frais PaPi',
};
/** Taux courant d'une commission (réglage admin, sinon défaut). Borné [0,1]. */
export function getCommissionRate(key: CommissionKey): number {
  const n = Number(getSetting('commission.' + key, String(COMMISSION_DEFAULTS[key])));
  return Number.isFinite(n) && n >= 0 && n <= 1 ? n : COMMISSION_DEFAULTS[key];
}
/** Fixe un taux de commission (admin). Borné [0,1]. */
export function setCommissionRate(key: CommissionKey, rate: number): void {
  setSetting('commission.' + key, String(Math.max(0, Math.min(1, Number(rate) || 0))));
}
/** Tous les taux courants (pour l'écran admin). */
export function allCommissionRates(): Record<CommissionKey, number> {
  return {
    platform_commission_rate: getCommissionRate('platform_commission_rate'),
    affiliate_share_rate: getCommissionRate('affiliate_share_rate'),
    papi_fee_rate: getCommissionRate('papi_fee_rate'),
  };
}

// ── RÉGLAGES OPÉRATIONNELS réglables par l'ADMIN (Pascal 2026-07-09 : « toutes ces variables
//    doivent être dans l'admin »). Registre de nombres tunables (rayons, seuils…) — plus de dur. ──
export interface OpsSpec { def: number; label: string; unit: string; min: number; max: number }
export const OPS_SETTINGS: Record<string, OpsSpec> = {
  'eat.plat_radius_m': { def: 500, label: 'Plats de Mama — rayon de découverte', unit: 'm', min: 100, max: 5000 },
  'eat.plat_radius_max_m': { def: 1000, label: 'Plats de Mama — rayon max si aucun voisin', unit: 'm', min: 200, max: 10000 },
  'capacity.warnRegistered': { def: 20000, label: 'Capacité — alerte inscrits', unit: 'users', min: 100, max: 10000000 },
  'capacity.critRegistered': { def: 50000, label: 'Capacité — critique inscrits', unit: 'users', min: 100, max: 10000000 },
  'capacity.warnDau': { def: 5000, label: 'Capacité — alerte actifs/24h', unit: 'users', min: 50, max: 10000000 },
  'capacity.critDau': { def: 12000, label: 'Capacité — critique actifs/24h', unit: 'users', min: 50, max: 10000000 },
};
/** Valeur courante d'un réglage ops (admin, sinon défaut). Bornée. */
export function getOps(key: string): number {
  const spec = OPS_SETTINGS[key];
  if (!spec) return 0;
  const n = Number(getSetting('ops.' + key, String(spec.def)));
  return Number.isFinite(n) ? Math.max(spec.min, Math.min(spec.max, n)) : spec.def;
}
/** Fixe un réglage ops (admin). Borné. */
export function setOps(key: string, value: number): boolean {
  const spec = OPS_SETTINGS[key];
  if (!spec) return false;
  const n = Math.max(spec.min, Math.min(spec.max, Number(value) || spec.def));
  setSetting('ops.' + key, String(n));
  return true;
}
/** Tous les réglages ops courants (écran admin). */
export function allOps(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const k of Object.keys(OPS_SETTINGS)) out[k] = getOps(k);
  return out;
}
export function shopSectionsState(): Record<ShopSection, boolean> {
  return {
    eat: isShopSectionEnabled('eat'), annonces: isShopSectionEnabled('annonces'), boutique: isShopSectionEnabled('boutique'),
    service: isShopSectionEnabled('service'), emploi: isShopSectionEnabled('emploi'), location: isShopSectionEnabled('location'),
    immobilier: isShopSectionEnabled('immobilier'),
  };
}

// ── Fonctionnalités globales ON/OFF (Pascal 2026-06-21) ──
// Capacités "waouh" optionnelles, parquées par défaut pour ne pas peser sur le
// lancement Mada. Le super-admin les allume quand il veut (ex. pièces 3D).
export type AppFeature = 'piece3d' | 'unified_feed' | 'cardos';
const FEATURE_KEYS: Record<AppFeature, string> = {
  piece3d: 'feature_piece3d_enabled',
  unified_feed: 'feature_unified_feed', // LOT 2 ④ : feed lu depuis unified_posts
  cardos: 'feature_cardos_enabled',     // Card OS : feed rendu par le moteur unique SuperCard
};
// Défaut OFF : la capacité existe mais reste éteinte tant que l'admin ne l'allume pas.
const FEATURE_DEFAULT: Record<AppFeature, string> = { piece3d: '0', unified_feed: '0', cardos: '0' };
export function isFeatureEnabled(feature: AppFeature): boolean {
  return getSetting(FEATURE_KEYS[feature], FEATURE_DEFAULT[feature]) === '1';
}
export function setFeatureEnabled(feature: AppFeature, on: boolean): void {
  setSetting(FEATURE_KEYS[feature], on ? '1' : '0');
}
export function featuresState(): Record<AppFeature, boolean> {
  return { piece3d: isFeatureEnabled('piece3d'), unified_feed: isFeatureEnabled('unified_feed'), cardos: isFeatureEnabled('cardos') };
}

// ── Mode d'affichage par section : Carte | Photo (Pascal 2026-07-06, piloté en ADMIN) ──
// Design system : chaque page existe en 2 affichages. L'admin choisit le mode de chaque
// section. Défaut 'cards' partout → zéro changement visuel tant que l'admin ne flippe pas.
export type DisplaySection = 'feed' | 'annonces' | 'eat' | 'boutique' | 'service' | 'discussions' | 'profil' | 'card' | 'drive';
export type DisplayMode = 'cards' | 'photo';
export const DISPLAY_SECTIONS: DisplaySection[] = ['feed', 'annonces', 'eat', 'boutique', 'service', 'discussions', 'profil', 'card', 'drive'];
export function getDisplayMode(section: DisplaySection): DisplayMode {
  return getSetting(`display_${section}`, 'cards') === 'photo' ? 'photo' : 'cards';
}
export function setDisplayMode(section: DisplaySection, mode: DisplayMode): void {
  setSetting(`display_${section}`, mode === 'photo' ? 'photo' : 'cards');
}
export function displayModeState(): Record<DisplaySection, DisplayMode> {
  return Object.fromEntries(DISPLAY_SECTIONS.map((s) => [s, getDisplayMode(s)])) as Record<DisplaySection, DisplayMode>;
}
