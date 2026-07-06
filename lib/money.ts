/**
 * Talk2Me — formatage monétaire UNIQUE (Pascal 2026-06-23).
 *
 * T2M est multi-devise mais l'user voit LA devise de son marché. On démarre à
 * Madagascar → Ariary (MGA), SANS sous-unité (pas de centimes). En France ce
 * serait l'euro. Toute la couche commerce doit passer par ici — fini les « € »
 * codés en dur dans chaque composant (cause majeure d'incohérence, cf AUDIT_COMMERCE.md).
 *
 * Convention de stockage : les montants entiers sont dans la PLUS PETITE unité de
 * la devise. MGA : 1 = 1 Ariary (pas de ×100). EUR/USD : 1 = 1 centime (×100).
 * → `toMinor` à la SAISIE, `formatMoney` à l'AFFICHAGE.
 */

// Devise du marché courant (Madagascar au lancement). Côté serveur, surchargée par
// process.env.MARKET_CURRENCY ; côté client on prend ce défaut.
export const MARKET_CURRENCY: string =
  (typeof process !== 'undefined' && process.env && process.env.MARKET_CURRENCY) || 'MGA';

/** Affiche un montant (en plus petite unité) dans sa devise. MGA = entier « Ar ». */
export function formatMoney(minor: number | null | undefined, currency: string = MARKET_CURRENCY): string {
  const n = Math.round(Number(minor) || 0);
  switch (currency) {
    case 'MGA':
      return n.toLocaleString('fr-FR') + ' Ar';
    case 'EUR':
      return (n / 100).toLocaleString('fr-FR', { minimumFractionDigits: n % 100 ? 2 : 0, maximumFractionDigits: 2 }) + ' €';
    case 'USD':
      return '$' + (n / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    default:
      return n.toLocaleString('fr-FR') + ' ' + currency;
  }
}

/** Inverse de toMinor : de la plus petite unité vers la valeur saisissable (pour pré-remplir un champ). */
export function fromMinor(minor: number | null | undefined, currency: string = MARKET_CURRENCY): number {
  const n = Number(minor) || 0;
  return currency === 'MGA' ? Math.round(n) : n / 100;
}

/** Symbole/suffixe court de la devise (pour les libellés de champ « Prix (Ar) »). */
export function currencyLabel(currency: string = MARKET_CURRENCY): string {
  return currency === 'MGA' ? 'Ar' : currency === 'EUR' ? '€' : currency === 'USD' ? '$' : currency;
}

/** Convertit une saisie utilisateur (ex « 5000 » ou « 12,50 ») en plus petite unité. */
export function toMinor(amount: number | string, currency: string = MARKET_CURRENCY): number {
  const a = typeof amount === 'string' ? parseFloat(amount.replace(',', '.')) : Number(amount);
  if (!Number.isFinite(a) || a < 0) return 0;
  if (currency === 'MGA') return Math.round(a);      // Ariary : pas de sous-unité
  return Math.round(a * 100);                          // EUR/USD : centimes
}
