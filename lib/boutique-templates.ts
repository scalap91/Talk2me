/**
 * Talk2Me #428 — Templates de boutique (Pascal). Léa construit une boutique à
 * partir d'un de ces modèles : elle crée la boutique + un EMPLACEMENT vide par
 * rayon (catégorie). AUCUN faux produit/prix inventé (doctrine content-grounding) :
 * les emplacements sont à compléter par l'utilisateur avec ses vrais produits.
 */

export interface BoutiqueTemplate {
  key: string;
  name: string;
  emoji: string;
  categories: string[];
}

export const BOUTIQUE_TEMPLATES: BoutiqueTemplate[] = [
  { key: 'mode-femme', name: 'Mode Femme', emoji: '👗', categories: ['Robes', 'Hauts', 'Sacs', 'Chaussures', 'Accessoires'] },
  { key: 'mode-homme', name: 'Mode Homme', emoji: '👔', categories: ['T-shirts', 'Pantalons', 'Chaussures', 'Montres', 'Accessoires'] },
  { key: 'beaute', name: 'Beauté & Soins', emoji: '💄', categories: ['Maquillage', 'Soins visage', 'Parfums', 'Cheveux'] },
  { key: 'bijoux', name: 'Bijoux & Montres', emoji: '💍', categories: ['Colliers', 'Bagues', 'Bracelets', 'Boucles', 'Montres'] },
  { key: 'tech', name: 'High-Tech', emoji: '📱', categories: ['Téléphones', 'Audio', 'Accessoires', 'Objets connectés'] },
  { key: 'maison', name: 'Maison & Déco', emoji: '🏠', categories: ['Décoration', 'Cuisine', 'Rangement', 'Luminaires'] },
  { key: 'artisan', name: 'Fait main / Artisan', emoji: '🧵', categories: ['Créations', 'Sur-mesure', 'Cadeaux'] },
];

export function getBoutiqueTemplate(key: string): BoutiqueTemplate | null {
  const k = (key || '').trim().toLowerCase();
  return (
    BOUTIQUE_TEMPLATES.find((t) => t.key === k) ||
    BOUTIQUE_TEMPLATES.find((t) => t.name.toLowerCase() === k) ||
    null
  );
}

/** Résumé texte des templates pour le system-prompt de Léa. */
export function boutiqueTemplatesSummary(): string {
  return BOUTIQUE_TEMPLATES.map(
    (t) => `${t.key} (${t.name}, ${t.categories.length} rayons : ${t.categories.join(', ')})`
  ).join(' · ');
}
