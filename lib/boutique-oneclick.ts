/**
 * Talk2Me — Boutique en 1 clic (#429). Thèmes curés : un tap → une boutique
 * dropship pré-remplie de vrais produits fournisseur, prête à partager.
 * Curé (pas de déversement de camelote) — doctrine [[feedback_talk2me_shop_contextuel]].
 */

export interface ThemeRow {
  name: string;
  query: string;
  /** Si fourni → sourcing par CATÉGORIE CJ (fiable) au lieu du mot-clé. */
  categoryId?: string;
}
export interface BoutiqueTheme {
  key: string;
  name: string;
  emoji: string;
  /** RAYONS du magasin : chaque rayon = une ligne de produits dans la vitrine.
      Mots-clés SIMPLES (CJ matche mieux). Un univers = plusieurs rayons. */
  rows: ThemeRow[];
}

export const BOUTIQUE_THEMES: BoutiqueTheme[] = [
  {
    key: 'perruques', name: 'Perruques humaines', emoji: '💇‍♀️',
    // Sourcing par VRAIE catégorie CJ (pas mot-clé) → de vraies perruques.
    rows: [
      { name: 'Cheveux humains', query: '', categoryId: '44733589-BEE4-448D-86F9-A1B5A9710C79' },
      { name: 'Synthétiques', query: '', categoryId: 'DB81767B-2083-4C66-8E8D-1A0D897ABA7C' },
      { name: 'Lace synthétiques', query: '', categoryId: '6C4CEB64-10FD-447E-BB1D-F6F5C1E71442' },
    ],
  },
  {
    key: 'accessoires', name: 'Accessoires & mode', emoji: '✨',
    rows: [
      { name: 'Montres', query: 'watch' },
      { name: 'Bijoux', query: 'necklace' },
      { name: 'Lunettes de soleil', query: 'sunglasses' },
      { name: 'Sacs', query: 'handbag' },
      { name: 'Ceintures', query: 'belt' },
    ],
  },
  {
    key: 'hightech', name: 'High-tech malin', emoji: '📱',
    rows: [
      { name: 'Audio', query: 'earphones' },
      { name: 'Coques & accessoires', query: 'phone case' },
      { name: 'Chargeurs', query: 'charger' },
      { name: 'Gadgets', query: 'gadget' },
    ],
  },
  {
    key: 'maison', name: 'Maison & déco', emoji: '🏠',
    rows: [
      { name: 'Luminaires', query: 'lamp' },
      { name: 'Cuisine', query: 'kitchen gadget' },
      { name: 'Déco', query: 'home decoration' },
      { name: 'Rangement', query: 'storage box' },
    ],
  },
  {
    key: 'beaute', name: 'Beauté & soin', emoji: '💄',
    rows: [
      { name: 'Maquillage', query: 'makeup brush' },
      { name: 'Soin visage', query: 'skin care' },
      { name: 'Cheveux', query: 'hair accessories' },
      { name: 'Ongles', query: 'nail art' },
    ],
  },
  {
    key: 'sport', name: 'Sport & plein air', emoji: '🏃',
    rows: [
      { name: 'Yoga', query: 'yoga' },
      { name: 'Fitness', query: 'fitness equipment' },
      { name: 'Plein air', query: 'camping' },
      { name: 'Vélo', query: 'bike accessories' },
    ],
  },
  {
    key: 'animaux', name: 'Pour les animaux', emoji: '🐾',
    rows: [
      { name: 'Chien', query: 'dog toy' },
      { name: 'Chat', query: 'cat toy' },
      { name: 'Accessoires', query: 'pet supplies' },
    ],
  },
  { key: 'montres', name: 'Montres', emoji: '⌚', rows: [{ name: 'Montres', query: 'watch' }, { name: 'Montres connectées', query: 'smart watch' }] },
  { key: 'bijoux', name: 'Bijoux', emoji: '💍', rows: [{ name: 'Colliers', query: 'necklace' }, { name: "Boucles d'oreilles", query: 'earrings' }, { name: 'Bracelets', query: 'bracelet' }] },
  { key: 'lunettes', name: 'Lunettes', emoji: '🕶️', rows: [{ name: 'Soleil', query: 'sunglasses' }, { name: 'Montures', query: 'glasses frame' }] },
  { key: 'sacs', name: 'Sacs & bagages', emoji: '👜', rows: [{ name: 'Sacs à main', query: 'handbag' }, { name: 'Sacs à dos', query: 'backpack' }] },
  { key: 'chaussures', name: 'Chaussures', emoji: '👟', rows: [{ name: 'Baskets', query: 'sneakers' }, { name: 'Sandales', query: 'sandals' }] },
  { key: 'cuisine', name: 'Cuisine', emoji: '🍳', rows: [{ name: 'Ustensiles', query: 'kitchen gadget' }, { name: 'Accessoires', query: 'kitchen tool' }] },
  { key: 'soinpeau', name: 'Soin de la peau', emoji: '🧴', rows: [{ name: 'Soin visage', query: 'skin care' }, { name: 'Masques', query: 'face mask beauty' }] },
  { key: 'yoga', name: 'Yoga & bien-être', emoji: '🧘', rows: [{ name: 'Yoga', query: 'yoga' }, { name: 'Tapis', query: 'yoga mat' }] },
  { key: 'chien', name: 'Mon chien', emoji: '🐶', rows: [{ name: 'Jouets', query: 'dog toy' }, { name: 'Accessoires', query: 'dog accessories' }] },
  { key: 'chat', name: 'Mon chat', emoji: '🐱', rows: [{ name: 'Jouets', query: 'cat toy' }, { name: 'Accessoires', query: 'cat accessories' }] },
  { key: 'audio', name: 'Audio', emoji: '🎧', rows: [{ name: 'Écouteurs', query: 'earphones' }, { name: 'Enceintes', query: 'bluetooth speaker' }] },
  { key: 'telephone', name: 'Accessoires téléphone', emoji: '📲', rows: [{ name: 'Coques', query: 'phone case' }, { name: 'Supports', query: 'phone holder' }] },
  { key: 'bebe', name: 'Bébé & enfant', emoji: '🍼', rows: [{ name: 'Jouets', query: 'baby toy' }, { name: 'Accessoires', query: 'baby accessories' }] },
  { key: 'voiture', name: 'Auto', emoji: '🚗', rows: [{ name: 'Accessoires', query: 'car accessories' }, { name: 'Support téléphone', query: 'car phone holder' }] },
];

export const THEME_MAP: Record<string, BoutiqueTheme> = Object.fromEntries(
  BOUTIQUE_THEMES.map((t) => [t.key, t])
);

/** Marge par défaut appliquée au coût fournisseur (le vendeur ajuste ensuite). */
export const DEFAULT_MARGIN = 2.2;

/** Prix de vente conseillé (coût × marge), arrondi, libellé €. '' si pas de coût. */
export function suggestedPrice(cost: number | null): string {
  if (cost == null || !isFinite(cost) || cost <= 0) return '';
  const p = Math.max(1, Math.round(cost * DEFAULT_MARGIN));
  return `${p} €`;
}
