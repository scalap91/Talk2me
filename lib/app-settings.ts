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
export type ShopSection = 'eat' | 'annonces' | 'boutique';
const SHOP_KEYS: Record<ShopSection, string> = {
  eat: 'eat_enabled',
  annonces: 'annonces_enabled',
  boutique: 'boutique_enabled',
};
export function isShopSectionEnabled(section: ShopSection): boolean {
  return getSetting(SHOP_KEYS[section], '1') === '1';
}
export function setShopSectionEnabled(section: ShopSection, on: boolean): void {
  setSetting(SHOP_KEYS[section], on ? '1' : '0');
}
export function shopSectionsState(): Record<ShopSection, boolean> {
  return { eat: isShopSectionEnabled('eat'), annonces: isShopSectionEnabled('annonces'), boutique: isShopSectionEnabled('boutique') };
}
