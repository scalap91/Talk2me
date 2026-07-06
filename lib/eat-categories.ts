/**
 * Talk2Me — Catégories Eat (types de cuisine). SOURCE UNIQUE partagée par :
 *  - le formulaire « Ajouter un restaurant » (AddRestaurantSheet) → tague le resto,
 *  - la page Shop · Catégories (section Plats) → permet de filtrer par catégorie.
 * Garder cette liste alignée des deux côtés (un resto tagué « Burger » doit
 * retomber sous la catégorie « Burger »).
 */
export const EAT_CATEGORIES = [
  'Malagasy', 'Asiatique', 'Indien', 'Burger', 'Pizza', 'Poulet',
  'Grillades', 'Fast-food', 'Healthy', 'Dessert', 'Boissons', 'Autres',
] as const;

export type EatCategory = (typeof EAT_CATEGORIES)[number];
