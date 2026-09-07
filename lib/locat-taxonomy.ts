/**
 * LOCAT👀 — TAXONOMIE à 2 niveaux (Pascal 2026-09-07), pensée LOCATION ENTRE PARTICULIERS
 * (pas « chantier/BTP » façon Kiloutou) : on range par OCCASION DE VIE, cérémonie en tête (Mada).
 * Source unique côté web ; le natif en tient un miroir (lib/locat_taxonomy.dart). Le champ
 * `category` d'un bien = le LABEL de la FAMILLE ; la sous-catégorie vit dans le JSON (`subcategory`).
 */
export interface LocatFamily { key: string; label: string; emoji: string; subs: string[] }

export const LOCAT_FAMILIES: LocatFamily[] = [
  { key: 'ceremonie', label: 'Cérémonie & réception', emoji: '🎉', subs: ['Robes & tenues', 'Tables, chaises & bancs', 'Tentes & barnums', 'Vaisselle & cuisine', 'Décoration'] },
  { key: 'son_image', label: 'Son, image & scène', emoji: '🎤', subs: ['Sono & enceintes', 'Micro & DJ', 'Vidéoprojecteur & écran', 'Photo & vidéo', 'Instruments de musique'] },
  { key: 'bricolage', label: 'Bricolage & outillage', emoji: '🔧', subs: ['Électroportatif', 'Peinture & ponçage', 'Échelle & échafaudage', 'Mesure'] },
  { key: 'btp', label: 'BTP & gros œuvre', emoji: '🏗️', subs: ['Bétonnière', 'Groupe électrogène', 'Compresseur', 'Marteau-piqueur', 'Brouette'] },
  { key: 'jardin', label: 'Jardinage & agricole', emoji: '🌱', subs: ['Tondeuse & débroussailleuse', 'Tronçonneuse', 'Motoculteur', 'Matériel agricole'] },
  { key: 'maison', label: 'Maison & électroménager', emoji: '🏠', subs: ['Nettoyeur haute pression', 'Aspirateur', 'Gros électroménager', 'Mobilier'] },
  { key: 'transport', label: 'Transport & mobilité', emoji: '🚗', subs: ['Voiture', 'Moto & scooter', 'Vélo', 'Remorque', 'Utilitaire'] },
  { key: 'sport', label: 'Sport, loisirs & plein air', emoji: '⛺', subs: ['Camping', 'Sport', 'Jeux & animation', 'Voyage'] },
  { key: 'hightech', label: 'High-tech & informatique', emoji: '💻', subs: ['Ordinateur & tablette', 'Console & jeux', 'Drone', 'Accessoires'] },
  { key: 'bebe', label: 'Bébé & enfant', emoji: '👶', subs: ['Poussette', 'Lit & parc', 'Siège auto', 'Jouets'] },
];

/** Retrouve une famille par son label (le `category` stocké sur le bien). */
export function familyByLabel(label: string): LocatFamily | undefined {
  return LOCAT_FAMILIES.find((f) => f.label === label);
}
