/**
 * Talk2Me Fuzz IA — 100 prompts variés pour audit régressions.
 *
 * Couverture : 12 intents déclarés dans consciousness.json + intents ambigus +
 * non-intents conversationnels + cas pièges (faute frappe, multi-intent,
 * message vide, emoji seul...).
 *
 * Pascal mission 2026-06-04 : auditer le pipeline après Phase 1 habits +
 * Consciousness Lot 1 + Lot 1bis Couche B + Lot 2 modes.
 *
 * Chaque prompt a :
 *   - id (1..100)
 *   - text (la phrase user)
 *   - category (hotel|restaurant|youtube_video|...|ambiguous|conversational|tricky)
 *   - expected_intent (intent attendu si applicable, ou null)
 *   - expected_card (kind de card attendue, ou null si conversationnel/clarif)
 *   - notes (commentaire pour le rapport)
 */

export const PROMPTS = [
  // === HOTEL (10) — intent hotel ===
  { id: 1, text: "Trouve un hôtel à Paris", category: 'hotel', expected_intent: 'hotel', expected_card: 'PlaceCard', notes: 'Cas simple' },
  { id: 2, text: "Hôtel pas cher à Lyon", category: 'hotel', expected_intent: 'hotel', expected_card: 'PlaceCard', notes: 'Filtre prix (ignoré OK)' },
  { id: 3, text: "Hôtel Évry", category: 'hotel', expected_intent: 'hotel', expected_card: 'PlaceCard', notes: 'Bug PROD historique (resto au lieu d\'hôtel)' },
  { id: 4, text: "Réserver une chambre d'hôtel à Marseille", category: 'hotel', expected_intent: 'hotel', expected_card: 'PlaceCard', notes: 'Synonyme étendu' },
  { id: 5, text: "Une auberge à Lille", category: 'hotel', expected_intent: 'hotel', expected_card: 'PlaceCard', notes: 'Synonyme auberge' },
  { id: 6, text: "Logement pour la nuit à Bordeaux", category: 'hotel', expected_intent: 'hotel', expected_card: 'PlaceCard', notes: 'Synonyme logement' },
  { id: 7, text: "Hôtel 4 étoiles Nice", category: 'hotel', expected_intent: 'hotel', expected_card: 'PlaceCard', notes: 'Filtre étoiles' },
  { id: 8, text: "Je cherche un hôtel à Toulouse pour ce weekend", category: 'hotel', expected_intent: 'hotel', expected_card: 'PlaceCard', notes: 'Phrase longue' },
  { id: 9, text: "Hôtel près de la gare à Strasbourg", category: 'hotel', expected_intent: 'hotel', expected_card: 'PlaceCard', notes: 'POI proche' },
  { id: 10, text: "Une nuit d'hôtel à Rennes", category: 'hotel', expected_intent: 'hotel', expected_card: 'PlaceCard', notes: 'Synonyme nuit d\'hôtel' },

  // === RESTAURANT (10) — intent restaurant ===
  { id: 11, text: "Restaurant italien à Paris", category: 'restaurant', expected_intent: 'restaurant', expected_card: 'PlaceCard', notes: 'Cuisine italienne' },
  { id: 12, text: "Resto sushi à Lyon", category: 'restaurant', expected_intent: 'restaurant', expected_card: 'PlaceCard', notes: 'Resto + cuisine japonaise' },
  { id: 13, text: "Où manger à Marseille ?", category: 'restaurant', expected_intent: 'restaurant', expected_card: 'PlaceCard', notes: 'Verbe manger' },
  { id: 14, text: "Trattoria Nice", category: 'restaurant', expected_intent: 'restaurant', expected_card: 'PlaceCard', notes: 'Synonyme trattoria' },
  { id: 15, text: "Bistrot lyonnais Bordeaux", category: 'restaurant', expected_intent: 'restaurant', expected_card: 'PlaceCard', notes: 'Synonyme bistrot' },
  { id: 16, text: "Restaurant gastronomique Toulouse", category: 'restaurant', expected_intent: 'restaurant', expected_card: 'PlaceCard', notes: 'Filtre gastro' },
  { id: 17, text: "Cuisine japonaise Strasbourg", category: 'restaurant', expected_intent: 'restaurant', expected_card: 'PlaceCard', notes: 'Synonyme cuisine japonaise' },
  { id: 18, text: "Manger libanais Lille", category: 'restaurant', expected_intent: 'restaurant', expected_card: 'PlaceCard', notes: 'Cuisine étrangère' },
  { id: 19, text: "Resto chinois pas cher Rennes", category: 'restaurant', expected_intent: 'restaurant', expected_card: 'PlaceCard', notes: 'Cuisine + prix' },
  { id: 20, text: "Brasserie Nantes", category: 'restaurant', expected_intent: 'restaurant', expected_card: 'PlaceCard', notes: 'Sous-catégorie restaurant' },

  // === YOUTUBE_VIDEO (10) ===
  { id: 21, text: "Mets-moi du Daft Punk", category: 'youtube_video', expected_intent: 'youtube_video', expected_card: 'YouTubeCard', notes: 'Mets-moi + artiste' },
  { id: 22, text: "Joue Bohemian Rhapsody", category: 'youtube_video', expected_intent: 'youtube_video', expected_card: 'YouTubeCard', notes: 'Joue + titre' },
  { id: 23, text: "Clip Despacito", category: 'youtube_video', expected_intent: 'youtube_video', expected_card: 'YouTubeCard', notes: 'Clip' },
  { id: 24, text: "Vidéo de Mr Beast", category: 'youtube_video', expected_intent: 'youtube_video', expected_card: 'YouTubeCard', notes: 'Vidéo + créateur' },
  { id: 25, text: "Chanson Imagine John Lennon", category: 'youtube_video', expected_intent: 'youtube_video', expected_card: 'YouTubeCard', notes: 'Chanson' },
  { id: 26, text: "Mets du rap français", category: 'youtube_video', expected_intent: 'youtube_video', expected_card: 'YouTubeCard', notes: 'Genre musical' },
  { id: 27, text: "Vidéo cuisine ramen", category: 'youtube_video', expected_intent: 'youtube_video', expected_card: 'YouTubeCard', notes: 'Vidéo tuto' },
  { id: 28, text: "Joue moi du Stromae", category: 'youtube_video', expected_intent: 'youtube_video', expected_card: 'YouTubeCard', notes: 'Joue moi' },
  { id: 29, text: "Documentaire sur la finance", category: 'youtube_video', expected_intent: 'youtube_video', expected_card: 'YouTubeCard', notes: 'Doc' },
  { id: 30, text: "Mets-moi Shape of You", category: 'youtube_video', expected_intent: 'youtube_video', expected_card: 'YouTubeCard', notes: 'Mets-moi + titre clair' },

  // === RECIPE (8) ===
  { id: 31, text: "Recette de couscous", category: 'recipe', expected_intent: 'recipe', expected_card: 'RecipeCard', notes: 'Recette plat traditionnel' },
  { id: 32, text: "Comment faire une tarte aux pommes", category: 'recipe', expected_intent: 'recipe', expected_card: 'RecipeCard', notes: 'Comment faire' },
  { id: 33, text: "Recette ratatouille", category: 'recipe', expected_intent: 'recipe', expected_card: 'RecipeCard', notes: 'Plat français' },
  { id: 34, text: "Préparer un boeuf bourguignon", category: 'recipe', expected_intent: 'recipe', expected_card: 'RecipeCard', notes: 'Verbe préparer' },
  { id: 35, text: "Recette de pâtes carbonara", category: 'recipe', expected_intent: 'recipe', expected_card: 'RecipeCard', notes: 'Plat italien' },
  { id: 36, text: "Comment cuisiner un risotto", category: 'recipe', expected_intent: 'recipe', expected_card: 'RecipeCard', notes: 'Verbe cuisiner' },
  { id: 37, text: "Recette tiramisu", category: 'recipe', expected_intent: 'recipe', expected_card: 'RecipeCard', notes: 'Dessert' },
  { id: 38, text: "Recette de paella", category: 'recipe', expected_intent: 'recipe', expected_card: 'RecipeCard', notes: 'Plat espagnol' },

  // === WEATHER (5) ===
  { id: 39, text: "Météo Paris", category: 'weather', expected_intent: 'weather', expected_card: 'WeatherCard', notes: 'Cas simple' },
  { id: 40, text: "Quel temps fait-il à Tokyo ?", category: 'weather', expected_intent: 'weather', expected_card: 'WeatherCard', notes: 'Quel temps' },
  { id: 41, text: "Météo demain Marseille", category: 'weather', expected_intent: 'weather', expected_card: 'WeatherCard', notes: 'Demain (jour futur)' },
  { id: 42, text: "Il pleut à New York ?", category: 'weather', expected_intent: 'weather', expected_card: 'WeatherCard', notes: 'Question pluie' },
  { id: 43, text: "Température Berlin", category: 'weather', expected_intent: 'weather', expected_card: 'WeatherCard', notes: 'Synonyme température' },

  // === FLIGHT (8) — Pascal bug detected: URL Skyscanner cassée ===
  { id: 44, text: "Vol Paris Tokyo", category: 'flight', expected_intent: 'flight', expected_card: 'SearchResultCard', notes: 'Origin + destination explicites' },
  { id: 45, text: "Vol Maroc", category: 'flight', expected_intent: 'flight', expected_card: 'SearchResultCard', notes: 'Destination seule — bug URL placeholders' },
  { id: 46, text: "Billet avion New York", category: 'flight', expected_intent: 'flight', expected_card: 'SearchResultCard', notes: 'Synonyme billet avion' },
  { id: 47, text: "Prendre l'avion pour Bali", category: 'flight', expected_intent: 'flight', expected_card: 'SearchResultCard', notes: 'Synonyme prendre l\'avion' },
  { id: 48, text: "Vol pas cher Lisbonne", category: 'flight', expected_intent: 'flight', expected_card: 'SearchResultCard', notes: 'Filtre prix' },
  { id: 49, text: "Vol Paris Marrakech aller-retour", category: 'flight', expected_intent: 'flight', expected_card: 'SearchResultCard', notes: 'Aller-retour' },
  { id: 50, text: "Combien coûte un vol pour Bangkok", category: 'flight', expected_intent: 'flight', expected_card: null, notes: 'Question prix (doctrine: pas de prix engageant)' },
  { id: 51, text: "Vol direct Paris Dubaï", category: 'flight', expected_intent: 'flight', expected_card: 'SearchResultCard', notes: 'Vol direct' },

  // === TRAIN (5) ===
  { id: 52, text: "Train Paris Lyon", category: 'train', expected_intent: 'train', expected_card: 'SearchResultCard', notes: 'TGV intérieur' },
  { id: 53, text: "Billet de train Bordeaux", category: 'train', expected_intent: 'train', expected_card: 'SearchResultCard', notes: 'Billet train' },
  { id: 54, text: "TGV Marseille", category: 'train', expected_intent: 'train', expected_card: 'SearchResultCard', notes: 'TGV' },
  { id: 55, text: "Train pour Strasbourg", category: 'train', expected_intent: 'train', expected_card: 'SearchResultCard', notes: 'Train + ville' },
  { id: 56, text: "SNCF Toulouse", category: 'train', expected_intent: 'train', expected_card: 'SearchResultCard', notes: 'Compagnie SNCF' },

  // === WIKIPEDIA (8) ===
  { id: 57, text: "Qui est Albert Einstein", category: 'wikipedia', expected_intent: 'wikipedia', expected_card: 'WikipediaCard', notes: 'Qui est' },
  { id: 58, text: "Biographie Napoléon", category: 'wikipedia', expected_intent: 'wikipedia', expected_card: 'WikipediaCard', notes: 'Personnage historique' },
  { id: 59, text: "Qu'est-ce que la relativité", category: 'wikipedia', expected_intent: null, expected_card: null, notes: 'Question encyclopédique (peut tomber general_web)' },
  { id: 60, text: "Histoire de la Tour Eiffel", category: 'wikipedia', expected_intent: 'wikipedia', expected_card: 'WikipediaCard', notes: 'Histoire de' },
  { id: 61, text: "Wikipedia Léonard de Vinci", category: 'wikipedia', expected_intent: 'wikipedia', expected_card: 'WikipediaCard', notes: 'Wikipedia mentionné' },
  { id: 62, text: "Qui était Cléopâtre", category: 'wikipedia', expected_intent: 'wikipedia', expected_card: 'WikipediaCard', notes: 'Qui était' },
  { id: 63, text: "Histoire de la Révolution française", category: 'wikipedia', expected_intent: 'wikipedia', expected_card: 'WikipediaCard', notes: 'Événement historique' },
  { id: 64, text: "Encyclopédie sur la photosynthèse", category: 'wikipedia', expected_intent: 'wikipedia', expected_card: 'WikipediaCard', notes: 'Encyclopédie' },

  // === PRODUCT_SHOPPING (5) ===
  { id: 65, text: "Robe de mariage femme", category: 'product_shopping', expected_intent: 'product_shopping', expected_card: 'ProductCard', notes: 'Vêtement' },
  { id: 66, text: "Acheter écouteurs sans fil", category: 'product_shopping', expected_intent: 'product_shopping', expected_card: 'ProductCard', notes: 'Acheter' },
  { id: 67, text: "Sneakers Nike taille 42", category: 'product_shopping', expected_intent: null, expected_card: null, notes: 'Marque + variant (peut tomber general_web)' },
  { id: 68, text: "Sac à dos randonnée pas cher", category: 'product_shopping', expected_intent: 'product_shopping', expected_card: 'ProductCard', notes: 'Catégorie produit' },
  { id: 69, text: "iPhone 15 reconditionné", category: 'product_shopping', expected_intent: null, expected_card: null, notes: 'Produit nommé (peut tomber general_web)' },

  // === GENERAL_WEB (10) — questions ouvertes ===
  { id: 70, text: "C'est quoi OVH", category: 'general_web', expected_intent: 'general_web', expected_card: 'SearchResultCard', notes: 'C\'est quoi entreprise' },
  { id: 71, text: "Qu'est-ce que le diagnostic immobilier", category: 'general_web', expected_intent: 'general_web', expected_card: null, notes: 'Doctrine conv-avant-recherche: texte d\'abord' },
  { id: 72, text: "Info actualité économique", category: 'general_web', expected_intent: 'general_web', expected_card: 'SearchResultCard', notes: 'Synonyme info' },
  { id: 73, text: "Comment fonctionne ChatGPT", category: 'general_web', expected_intent: null, expected_card: null, notes: 'Question how-to (peut tomber sur autre)' },
  { id: 74, text: "Site officiel Renault", category: 'general_web', expected_intent: 'general_web', expected_card: 'SearchResultCard', notes: 'Site officiel' },
  { id: 75, text: "Actualité Bitcoin", category: 'general_web', expected_intent: 'general_web', expected_card: 'SearchResultCard', notes: 'Actualité' },
  { id: 76, text: "Tu connais Genius Diagnostic ?", category: 'general_web', expected_intent: null, expected_card: null, notes: 'Doctrine: ambigu → 1 question' },
  { id: 77, text: "Infos Apple Pay", category: 'general_web', expected_intent: 'general_web', expected_card: 'SearchResultCard', notes: 'Infos service' },
  { id: 78, text: "C'est quoi un VPN", category: 'general_web', expected_intent: 'general_web', expected_card: null, notes: 'Définition technique' },
  { id: 79, text: "Que pense Elon Musk de l'IA", category: 'general_web', expected_intent: null, expected_card: null, notes: 'Opinion (peut tomber wikipedia ou general_web)' },

  // === AMBIGUOUS (10) — mots bruts, doctrine: 1 question ===
  { id: 80, text: "Check", category: 'ambiguous', expected_intent: null, expected_card: null, notes: 'Mot brut ambigu — doctrine: 1 question, AUCUN tool' },
  { id: 81, text: "Pomme", category: 'ambiguous', expected_intent: null, expected_card: null, notes: 'Fruit ou marque ?' },
  { id: 82, text: "Paris", category: 'ambiguous', expected_intent: null, expected_card: null, notes: 'Ville ou prénom ?' },
  { id: 83, text: "Apple", category: 'ambiguous', expected_intent: null, expected_card: null, notes: 'Marque ou fruit ?' },
  { id: 84, text: "Tokyo", category: 'ambiguous', expected_intent: null, expected_card: null, notes: 'Ville isolée' },
  { id: 85, text: "Mets", category: 'ambiguous', expected_intent: null, expected_card: null, notes: 'Verbe sans complément' },
  { id: 86, text: "Cuisine", category: 'ambiguous', expected_intent: null, expected_card: null, notes: 'Mot générique' },
  { id: 87, text: "Genius", category: 'ambiguous', expected_intent: null, expected_card: null, notes: 'Mot brut polysémique' },
  { id: 88, text: "Avocat", category: 'ambiguous', expected_intent: null, expected_card: null, notes: 'Métier ou fruit ?' },
  { id: 89, text: "Vélo", category: 'ambiguous', expected_intent: null, expected_card: null, notes: 'Trop générique' },

  // === CONVERSATIONAL (10) — pas de tool attendu ===
  { id: 90, text: "Salut", category: 'conversational', expected_intent: null, expected_card: null, notes: 'Salutation' },
  { id: 91, text: "Ça va ?", category: 'conversational', expected_intent: null, expected_card: null, notes: 'Politesse' },
  { id: 92, text: "Merci", category: 'conversational', expected_intent: null, expected_card: null, notes: 'Remerciement' },
  { id: 93, text: "Raconte-moi une blague", category: 'conversational', expected_intent: null, expected_card: null, notes: 'Humour' },
  { id: 94, text: "Tu es qui ?", category: 'conversational', expected_intent: null, expected_card: null, notes: 'Identité IA' },
  { id: 95, text: "Comment tu vas aujourd'hui ?", category: 'conversational', expected_intent: null, expected_card: null, notes: 'Politesse longue' },
  { id: 96, text: "Au revoir", category: 'conversational', expected_intent: null, expected_card: null, notes: 'Adieu' },
  { id: 97, text: "Comment t'appelles-tu", category: 'conversational', expected_intent: null, expected_card: null, notes: 'Nom IA — ne JAMAIS dire "Talk2Me"' },

  // === TRICKY (3) — cas pièges + multi-intent + emoji ===
  { id: 98, text: "Météo Paris et recette de couscous", category: 'tricky', expected_intent: null, expected_card: null, notes: 'Multi-intent (2 tools parallèles attendus)' },
  { id: 99, text: "🍕", category: 'tricky', expected_intent: null, expected_card: null, notes: 'Emoji seul' },
  { id: 100, text: "héltel pari", category: 'tricky', expected_intent: 'hotel', expected_card: 'PlaceCard', notes: 'Fautes de frappe sévères (hôtel paris)' },
];

if (PROMPTS.length !== 100) {
  throw new Error(`prompts.mjs: expected 100 prompts, got ${PROMPTS.length}`);
}
