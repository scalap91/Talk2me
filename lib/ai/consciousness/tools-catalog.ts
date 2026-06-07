/**
 * N3 — Catalogue des outils DYNAMIQUE (Pascal 2026-06-04).
 *
 * Source de vérité : `HANDLERS` de `lib/tools/handlers.ts` (registry réel
 * exécuté par /api/chat). On NE LISTE QUE les outils effectivement câblés.
 *
 * Si un nouveau tool est ajouté à HANDLERS sans entrée TOOL_METADATA → il
 * apparaîtra avec une description "non documentée" (signal explicite à corriger,
 * pas une excuse silencieuse).
 *
 * Doctrine [[talktome-toolkit-ia]] + [[talktome-raisonnement-ia]] :
 *   "Intent doit déterminer l'outil. JAMAIS query=mot-brut. JAMAIS mauvais
 *    outil (ex : 'hôtel' → search_place amenity=hotel, PAS search_recipe ni
 *    search_youtube)."
 */

import { HANDLERS } from '@/lib/tools/handlers';
import type { ConsciousnessContext } from './types';

interface ToolMetadata {
  intent: string;
  description: string;
}

const TOOL_METADATA: Record<string, ToolMetadata> = {
  search_youtube: {
    intent: 'vidéo / musique / clip / chanson / artiste',
    description: 'cherche une vraie vidéo YouTube (iframe officiel)',
  },
  search_place: {
    intent: 'restaurant / café / bar / pharmacie / hôpital / commerce local',
    description: 'OSM Overpass — amenity ciblé (restaurant, cafe, pharmacy, bakery, bar, pub, fast_food, hospital, clinic, doctors, dentist, school)',
  },
  search_recipe: {
    intent: 'recette de cuisine, ingrédients, plat',
    description: 'Marmiton / CuisineAZ — recette détaillée (ingrédients, prep_time)',
  },
  search_wikipedia: {
    intent: 'définition encyclopédique, biographie, lieu, événement historique',
    description: 'article Wikipedia (titre + résumé + image)',
  },
  get_weather: {
    intent: 'météo, température, prévisions',
    description: 'Open-Meteo — météo actuelle réelle, géocode auto si city fourni',
  },
  search_product: {
    intent: 'produit à acheter, prix, comparateur',
    description: 'AliExpress (FR + EUR) — produits réels avec prix BRUT (jamais recalculé)',
  },
  search_web: {
    intent: 'information générale, actualité, entreprise, marque, sujet large',
    description: 'Brave / Bing / DDG — recherche web générique',
  },
  fetch_url_content: {
    intent: 'lire une page web spécifique fournie',
    description: 'DERNIER RECOURS — fetch direct + Playwright fallback',
  },
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function buildToolsCatalog(_ctx: ConsciousnessContext): Promise<string> {
  const lines: string[] = [
    '## OUTILS DISPONIBLES',
    '',
    'J\'ai accès à ces outils. Avant chaque action, je dois choisir le BON outil :',
    '',
  ];

  // On itère sur les handlers RÉELLEMENT enregistrés (source = code, pas doc).
  for (const name of Object.keys(HANDLERS)) {
    const meta = TOOL_METADATA[name];
    if (meta) {
      lines.push(`- ${name} : ${meta.intent} — ${meta.description}`);
    } else {
      lines.push(`- ${name} : (tool non documenté dans consciousness — à compléter)`);
    }
  }

  lines.push('');
  lines.push('RÈGLE : intent doit déterminer l\'outil. JAMAIS query=mot-brut. JAMAIS mauvais outil (ex : "resto japonais à Paris" → search_place(amenity=restaurant, city=Paris), PAS search_recipe ni search_youtube).');
  lines.push('NOTE : aucun amenity "hotel" n\'est disponible côté search_place — pour un hôtel je dois passer par search_web avec une query enrichie type "hôtel <ville>".');
  return lines.join('\n');
}
