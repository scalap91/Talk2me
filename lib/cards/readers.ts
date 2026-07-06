/**
 * lib/cards/readers — LES LECTEURS (Card OS, Pascal 2026-06-30). Un lecteur ne décide
 * QUE comment il lit la MÊME SuperCard : VARIANTE de rendu (format connu), QUELLES
 * FACETTES il affiche (`reveal`), actions exposées, layout. AUCUNE logique de card
 * dupliquée — tout via SuperCardView. Ajouter un lecteur = une entrée ici.
 *
 * reveal = ce que le lecteur AFFICHE (le reste est masqué). Le prix n'apparaît QUE
 * là où ça a du sens (Boutique, Annonces). Facettes : media|title|text|price|rating|
 * place|source|actions.
 */
import type { ReadProfile, CardActionKind, CardType, SuperCard } from '@/lib/cards/supercard';

export type CardVariant = 'social' | 'product' | 'eat' | 'listing' | 'result' | 'square' | 'mini' | 'pin' | 'bubble' | 'card';

export interface ReaderDef extends ReadProfile {
  name: string;
  emoji: string;
  variant: CardVariant;
  layout: 'list' | 'grid' | 'row';
  ref: string;
  desc: string;
  // Types de cards que CE lecteur a le DROIT de lire. Une card sans ces attributs
  // n'est même PAS lue par ce lecteur (ex. Eat ne lit pas un 'product'/robe).
  // undefined = lit tout (chat, profil).
  accepts?: CardType[];
}

/** Le lecteur peut-il lire cette card ? (selon ses attributs) */
export function readerAccepts(reader: ReaderDef, card: SuperCard): boolean {
  if (!reader.accepts || reader.accepts.length === 0) return true;
  return card.types.some((t) => reader.accepts!.includes(t));
}

export const READERS: Record<string, ReaderDef> = {
  chat: {
    reader: 'chat', name: 'Chat (Léa)', emoji: '💬', variant: 'bubble', level: 'normal', layout: 'list',
    reveal: ['media', 'title', 'text', 'place', 'price', 'actions'], // Léa adapte selon l'intention
    actions: ['open', 'buy', 'reserve', 'order', 'contact', 'route', 'save', 'share'],
    ref: 'iMessage / WhatsApp (aperçu riche en bulle)',
    desc: 'Léa LIT et INTERPRÈTE : révèle la facette qui répond à l’intention et peut agir.',
  },
  feed: {
    reader: 'feed', name: 'Feed', emoji: '📰', variant: 'social', level: 'full', layout: 'list',
    reveal: ['media', 'title', 'text', 'source', 'price', 'actions'], // social ; prix visible SI produit partagé
    actions: ['save', 'share', 'open', 'buy'],
    accepts: ['social_post', 'image', 'video', 'article', 'product'], // le feed = les POSTS (+ produits partagés du Shop)
    ref: 'TikTok / Instagram (plein écran mobile, immersif)',
    desc: 'Format long, média en grand, barre sociale.',
  },
  eat: {
    reader: 'eat', name: 'Eat', emoji: '🍽️', variant: 'eat', level: 'full', layout: 'grid',
    reveal: ['media', 'title', 'rating', 'place', 'actions'], // resto : note + lieu, pas le prix d’un plat
    actions: ['reserve', 'order', 'route', 'contact'],
    accepts: ['restaurant'], // NOURRITURE uniquement : ignore product/robe etc.
    ref: 'Uber Eats (photo, note, livrer/réserver)',
    desc: 'Photo, note, adresse, réserver.',
  },
  boutique: {
    reader: 'boutique', name: 'Boutique', emoji: '🛍️', variant: 'product', level: 'normal', layout: 'grid',
    reveal: ['media', 'title', 'price', 'actions'], // produit : prix + acheter
    actions: ['buy', 'share'],
    accepts: ['product'],
    ref: 'Shein / Amazon (tuile produit : photo, prix, acheter)',
    desc: 'Tuiles produit, prix, acheter.',
  },
  annonces: {
    reader: 'annonces', name: 'Annonces', emoji: '🏷️', variant: 'listing', level: 'normal', layout: 'list',
    reveal: ['media', 'title', 'price', 'place', 'actions'], // leboncoin : prix + lieu
    actions: ['contact', 'save'],
    accepts: ['listing'],
    ref: 'leboncoin (photo, titre, prix, lieu)',
    desc: 'Photo, prix, lieu, contacter.',
  },
  search: {
    reader: 'search', name: 'Recherche', emoji: '🔎', variant: 'mini', level: 'mini', layout: 'grid',
    reveal: ['media', 'title'], // les POSTS du feed AU FORMAT FEED (portrait 3:4) en miniature
    actions: [],
    accepts: ['social_post', 'image', 'video', 'article', 'product'], // recherche du FEED (posts)
    ref: 'Instagram Explore (grille de posts en miniature)',
    desc: 'Les posts du feed en vignettes.',
  },
  profile: {
    reader: 'profile', name: 'Profil', emoji: '👤', variant: 'square', level: 'mini', layout: 'grid',
    reveal: ['media', 'title'], // Insta : juste la vignette
    actions: [],
    ref: 'Instagram (grille de vignettes carrées)',
    desc: 'Toutes les cards d’un propriétaire.',
  },
  map: {
    reader: 'map', name: 'Carte', emoji: '🗺️', variant: 'pin', level: 'mini', layout: 'list',
    reveal: ['title', 'place', 'actions'], // Maps : lieu + itinéraire, pas de prix
    actions: ['route'],
    accepts: ['place', 'restaurant', 'hotel', 'destination'], // cards géolocalisées
    ref: 'Google Maps (📍 + itinéraire)',
    desc: 'Points géolocalisés.',
  },
};

export function getReader(key: string): ReaderDef | undefined { return READERS[key]; }
export function listReaders(): ReaderDef[] { return Object.values(READERS); }
export type { CardActionKind };
