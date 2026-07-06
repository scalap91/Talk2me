/**
 * Talk2Me — Catégories d'annonce/article (Pascal 2026-06-27). SOURCE UNIQUE.
 * Utilisée par : le formulaire « Nouvelle annonce » (DepositAnnonceSheet), l'éditeur
 * de boutique (ajout/édition d'article) et le classement par catégorie de la boutique.
 * UN seul type d'annonce → chaque article porte SA catégorie issue de cette liste.
 */
export const ANNONCE_CATEGORIES = [
  'Mode', 'Maison', 'Électronique', 'Téléphones', 'Véhicules', 'Beauté',
  'Loisirs', 'Services', 'Emploi', 'Immobilier', 'Autres',
] as const;

export type AnnonceCategory = (typeof ANNONCE_CATEGORIES)[number];
