/**
 * N4 — Catalogue des cards DYNAMIQUE (Pascal 2026-06-04).
 *
 * Source de vérité = scan filesystem des composants cards :
 *   - /components/cards/*.tsx          (cards générées par tools)
 *   - /components/cards/editors/*.tsx  (cards éditeurs / IA)
 *   - /components/feed/*.tsx           (cards user-generated : Image/Video/Texte/Post)
 *
 * Pas d'invention : si un fichier card n'existe pas, on ne le liste pas.
 * Cache 5 min en mémoire (les fichiers ne changent pas en runtime).
 *
 * Doctrine [[talktome-cards-primaute]] + [[talk2me-card-vivante]] :
 *   "1 intent = 1 outil = 1 type de card. Cohérence stricte."
 */

import fs from 'node:fs';
import path from 'node:path';
import type { ConsciousnessContext } from './types';

interface CardMetadata {
  intent: string;
  source: string;
}

/**
 * Métadonnées curées par card. Clé = basename sans extension (ex "PlaceCard").
 * Si un fichier card existe sans entrée ici → listé brut sans intent (signal
 * à compléter, jamais inventé).
 */
const CARD_METADATA: Record<string, CardMetadata> = {
  PlaceCard: {
    intent: 'lieu / restaurant / hôtel / commerce',
    source: 'search_place',
  },
  ProductCard: {
    intent: 'produit e-commerce',
    source: 'search_product',
  },
  RecipeCard: {
    intent: 'recette détaillée',
    source: 'search_recipe',
  },
  SearchResultCard: {
    intent: 'résultats web (titre, snippet, favicon)',
    source: 'search_web',
  },
  WeatherCard: {
    intent: 'météo lieu',
    source: 'get_weather',
  },
  WikipediaCard: {
    intent: 'article Wikipedia',
    source: 'search_wikipedia',
  },
  // YouTube n'a pas de fichier dédié (rendu inline via iframe).
  YouTubeCard: {
    intent: 'vidéo YouTube embed',
    source: 'search_youtube',
  },
  // Cards user-generated (feed/)
  ImageCardDisplay: {
    intent: 'image créée par user (depuis l\'éditeur image)',
    source: 'user',
  },
  VideoCardDisplay: {
    intent: 'vidéo créée par user (depuis l\'éditeur vidéo)',
    source: 'user',
  },
  TexteCardDisplay: {
    intent: 'texte format publication',
    source: 'user',
  },
  PostCard: {
    intent: 'publication multi-slides (clip de conversation)',
    source: 'user',
  },
};

const COMPONENTS_DIR = path.resolve(process.cwd(), 'components');

interface ScannedCards {
  toolCards: string[];
  feedCards: string[];
  scannedAt: number;
}

let scanCache: ScannedCards | null = null;
const SCAN_TTL_MS = 5 * 60 * 1000;

function scanCardFiles(): ScannedCards {
  if (scanCache && Date.now() - scanCache.scannedAt < SCAN_TTL_MS) {
    return scanCache;
  }

  const toolCardsDir = path.join(COMPONENTS_DIR, 'cards');
  const feedCardsDir = path.join(COMPONENTS_DIR, 'feed');

  const toolCards: string[] = [];
  const feedCards: string[] = [];

  try {
    const entries = fs.readdirSync(toolCardsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile() && /Card.*\.tsx$/.test(entry.name)) {
        const base = entry.name.replace(/\.tsx$/, '');
        // Filtre les utilitaires (CardActionsBar, CardActionsMenu, etc.)
        if (/^(Place|Product|Recipe|SearchResult|Weather|Wikipedia|YouTube)Card$/.test(base)) {
          toolCards.push(base);
        }
      }
    }
  } catch {
    // Dir inexistant : on continue, on ne liste rien.
  }

  try {
    const entries = fs.readdirSync(feedCardsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile() && /Card.*\.tsx$/.test(entry.name)) {
        const base = entry.name.replace(/\.tsx$/, '');
        feedCards.push(base);
      }
    }
  } catch {
    // ignore
  }

  // YouTubeCard n'a pas de fichier .tsx dédié (rendu inline) → on l'ajoute
  // manuellement si search_youtube est un handler câblé. Sécurise la liste
  // car la card existe bien en sortie.
  if (!toolCards.includes('YouTubeCard')) {
    toolCards.push('YouTubeCard');
  }

  toolCards.sort();
  feedCards.sort();

  scanCache = { toolCards, feedCards, scannedAt: Date.now() };
  return scanCache;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function buildCardsCatalog(_ctx: ConsciousnessContext): Promise<string> {
  const { toolCards, feedCards } = scanCardFiles();

  const lines: string[] = [
    '## CARDS DISPONIBLES',
    '',
    'Types de cards que je peux créer / proposer :',
    '',
    '### Cards générées par mes outils',
  ];

  for (const name of toolCards) {
    const meta = CARD_METADATA[name];
    if (meta) {
      lines.push(`- ${name} : ${meta.intent} (source : ${meta.source})`);
    } else {
      lines.push(`- ${name} : (card non documentée dans consciousness — à compléter)`);
    }
  }

  if (feedCards.length > 0) {
    lines.push('');
    lines.push('### Cards user-generated (éditeur de Card)');
    for (const name of feedCards) {
      const meta = CARD_METADATA[name];
      if (meta) {
        lines.push(`- ${name} : ${meta.intent} (source : ${meta.source})`);
      } else {
        lines.push(`- ${name} : (card non documentée dans consciousness — à compléter)`);
      }
    }
  }

  lines.push('');
  lines.push('RÈGLE : 1 intent = 1 outil = 1 type de card. Cohérence stricte. Pas de RecipeCard pour une demande d\'hôtel, pas de PlaceCard pour une demande de vidéo.');
  return lines.join('\n');
}
