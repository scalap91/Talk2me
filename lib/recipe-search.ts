/**
 * Recipe scraper Marmiton (+ fallback CuisineAZ).
 * Utilisé par /api/search/recipe ET directement par /api/chat (pas de double-fetch HTTP).
 *
 * Source de vérité : JSON-LD schema.org Recipe embarqué dans la page (servi par
 * Marmiton et CuisineAZ). Ça nous donne name, image, prepTime ISO 8601,
 * recipeYield, recipeIngredient[], description SANS dépendre de classes CSS
 * fragiles. Fallback regex/h1 si JSON-LD absent.
 *
 * Doctrine : si scraping échoue → retourne null. JAMAIS d'invention.
 */

import * as cheerio from 'cheerio';

export interface RecipeCardData {
  name: string;
  image: string | null;
  prep_time: string | null;
  servings: string | null;
  difficulty: string | null;
  ingredients: string[];
  description: string | null;
  source_url: string;
  source: 'marmiton' | 'cuisineaz';
}

interface CacheEntry {
  recipe: RecipeCardData | null;
  fetchedAt: number;
}

const cache = new Map<string, CacheEntry>();
const CACHE_TTL = 60 * 60 * 1000; // 1h
const FETCH_TIMEOUT = 8000;
const USER_AGENT = 'Talk2MeBot/0.1 (+https://genius-web.fr/talktome)';

async function fetchWithTimeout(url: string, timeout: number): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml,*/*',
        'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.5',
      },
    });
  } finally {
    clearTimeout(id);
  }
}

/** ISO 8601 duration ("PT45M", "PT1H30M") → "45 min" / "1 h 30". */
function isoDurationToHuman(iso: string | null | undefined): string | null {
  if (!iso || typeof iso !== 'string') return null;
  const m = iso.match(/^PT(?:(\d+)H)?(?:(\d+)M)?$/);
  if (!m) return null;
  const h = m[1] ? parseInt(m[1], 10) : 0;
  const min = m[2] ? parseInt(m[2], 10) : 0;
  if (h > 0 && min > 0) return `${h} h ${min}`;
  if (h > 0) return `${h} h`;
  if (min > 0) return `${min} min`;
  return null;
}

function guessDifficulty(html: string): string | null {
  const tags = ['Très facile', 'Facile', 'Moyen', 'Difficile'];
  for (const t of tags) {
    const re = new RegExp(`\\b${t.replace(/è/g, '[èe]')}\\b`, 'i');
    if (re.test(html)) return t;
  }
  return null;
}

function findRecipeLd($: cheerio.CheerioAPI): Record<string, unknown> | null {
  const scripts = $('script[type="application/ld+json"]').toArray();
  for (const el of scripts) {
    const txt = $(el).contents().text();
    if (!txt) continue;
    try {
      const data: unknown = JSON.parse(txt);
      const candidates: unknown[] = Array.isArray(data) ? data : [data];
      for (const c of candidates) {
        if (!c || typeof c !== 'object') continue;
        const obj = c as Record<string, unknown>;
        if (
          obj['@type'] === 'Recipe' ||
          (Array.isArray(obj['@type']) && (obj['@type'] as unknown[]).includes('Recipe'))
        ) {
          return obj;
        }
        const graph = obj['@graph'];
        if (Array.isArray(graph)) {
          for (const node of graph) {
            if (node && typeof node === 'object') {
              const n = node as Record<string, unknown>;
              if (n['@type'] === 'Recipe') return n;
            }
          }
        }
      }
    } catch {
      // bloc JSON-LD invalide → continue
    }
  }
  return null;
}

function ldToRecipe(
  ld: Record<string, unknown>,
  source_url: string,
  source: 'marmiton' | 'cuisineaz',
  rawHtml: string,
): RecipeCardData {
  const name = typeof ld.name === 'string' ? ld.name.trim() : '';

  let image: string | null = null;
  const rawImage = ld.image;
  if (typeof rawImage === 'string') image = rawImage;
  else if (Array.isArray(rawImage) && rawImage.length > 0) {
    const first = rawImage[0];
    image =
      typeof first === 'string'
        ? first
        : first && typeof first === 'object' && typeof (first as { url?: unknown }).url === 'string'
          ? (first as { url: string }).url
          : null;
  } else if (
    rawImage &&
    typeof rawImage === 'object' &&
    typeof (rawImage as { url?: unknown }).url === 'string'
  ) {
    image = (rawImage as { url: string }).url;
  }

  const totalTime = typeof ld.totalTime === 'string' ? ld.totalTime : null;
  const prepTime = typeof ld.prepTime === 'string' ? ld.prepTime : null;
  const prep_time = isoDurationToHuman(totalTime) || isoDurationToHuman(prepTime);

  const servings =
    typeof ld.recipeYield === 'string'
      ? ld.recipeYield.trim()
      : Array.isArray(ld.recipeYield) && typeof ld.recipeYield[0] === 'string'
        ? (ld.recipeYield[0] as string).trim()
        : null;

  const difficulty = guessDifficulty(rawHtml);

  const rawIngredients = ld.recipeIngredient;
  const ingredients: string[] = Array.isArray(rawIngredients)
    ? rawIngredients
        .filter((i): i is string => typeof i === 'string')
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 20)
    : [];

  const description =
    typeof ld.description === 'string' && ld.description.trim().length > 0
      ? ld.description.trim()
      : null;

  return {
    name,
    image,
    prep_time,
    servings,
    difficulty,
    ingredients,
    description,
    source_url,
    source,
  };
}

async function scrapeMarmiton(query: string): Promise<RecipeCardData | null> {
  try {
    const searchUrl = `https://www.marmiton.org/recettes/recherche.aspx?aqt=${encodeURIComponent(query)}`;
    const searchRes = await fetchWithTimeout(searchUrl, FETCH_TIMEOUT);
    if (!searchRes.ok) {
      console.error('[recipe/marmiton] search status', searchRes.status);
      return null;
    }
    const searchHtml = await searchRes.text();
    const $s = cheerio.load(searchHtml);

    let recipeUrl: string | null = null;
    $s('a[href*="/recettes/recette_"]').each((_, el) => {
      if (recipeUrl) return;
      const href = $s(el).attr('href');
      if (!href) return;
      if (href.includes('/recettes/categorie')) return;
      recipeUrl = href.startsWith('http')
        ? href
        : `https://www.marmiton.org${href.startsWith('/') ? href : `/${href}`}`;
    });
    if (!recipeUrl) {
      console.error('[recipe/marmiton] no recipe link');
      return null;
    }

    const recipeRes = await fetchWithTimeout(recipeUrl, FETCH_TIMEOUT);
    if (!recipeRes.ok) {
      console.error('[recipe/marmiton] recipe status', recipeRes.status);
      return null;
    }
    const recipeHtml = await recipeRes.text();
    const $r = cheerio.load(recipeHtml);

    const ld = findRecipeLd($r);
    if (ld) {
      const recipe = ldToRecipe(ld, recipeUrl, 'marmiton', recipeHtml);
      if (recipe.name.length > 0) return recipe;
    }

    const name = $r('h1').first().text().trim();
    if (!name) return null;
    const ogImg = $r('meta[property="og:image"]').attr('content') || null;
    const desc = $r('meta[name="description"]').attr('content') || null;
    return {
      name,
      image: ogImg,
      prep_time: null,
      servings: null,
      difficulty: guessDifficulty(recipeHtml),
      ingredients: [],
      description: desc,
      source_url: recipeUrl,
      source: 'marmiton',
    };
  } catch (e) {
    console.error('[recipe/marmiton] error', e);
    return null;
  }
}

async function scrapeCuisineAZ(query: string): Promise<RecipeCardData | null> {
  try {
    const searchUrl = `https://www.cuisineaz.com/recettes/recherche/${encodeURIComponent(query)}`;
    const searchRes = await fetchWithTimeout(searchUrl, FETCH_TIMEOUT);
    if (!searchRes.ok) {
      console.error('[recipe/cuisineaz] search status', searchRes.status);
      return null;
    }
    const searchHtml = await searchRes.text();
    const $s = cheerio.load(searchHtml);

    let recipeUrl: string | null = null;
    $s('a[href*="/recettes/"]').each((_, el) => {
      if (recipeUrl) return;
      const href = $s(el).attr('href');
      if (!href) return;
      if (href.includes('/recettes/recherche')) return;
      if (href.match(/\/recettes\/?$/)) return;
      if (href.includes('/recettes/categorie')) return;
      if (!href.match(/\/recettes\/[^/]+-\d+/) && !href.match(/\.aspx?$/i)) return;
      recipeUrl = href.startsWith('http')
        ? href
        : `https://www.cuisineaz.com${href.startsWith('/') ? href : `/${href}`}`;
    });
    if (!recipeUrl) {
      console.error('[recipe/cuisineaz] no recipe link');
      return null;
    }

    const recipeRes = await fetchWithTimeout(recipeUrl, FETCH_TIMEOUT);
    if (!recipeRes.ok) {
      console.error('[recipe/cuisineaz] recipe status', recipeRes.status);
      return null;
    }
    const recipeHtml = await recipeRes.text();
    const $r = cheerio.load(recipeHtml);

    const ld = findRecipeLd($r);
    if (ld) {
      const recipe = ldToRecipe(ld, recipeUrl, 'cuisineaz', recipeHtml);
      if (recipe.name.length > 0) return recipe;
    }

    const name = $r('h1').first().text().trim();
    if (!name) return null;
    const ogImg = $r('meta[property="og:image"]').attr('content') || null;
    const desc = $r('meta[name="description"]').attr('content') || null;
    return {
      name,
      image: ogImg,
      prep_time: null,
      servings: null,
      difficulty: guessDifficulty(recipeHtml),
      ingredients: [],
      description: desc,
      source_url: recipeUrl,
      source: 'cuisineaz',
    };
  } catch (e) {
    console.error('[recipe/cuisineaz] error', e);
    return null;
  }
}

/**
 * Cherche une recette : Marmiton en priorité, fallback CuisineAZ.
 * - Cache mémoire 1h par query
 * - Retourne null si tout échoue (front gère gracieusement, doctrine no-excuses)
 */
export async function searchRecipe(query: string): Promise<RecipeCardData | null> {
  if (!query || query.trim().length < 2) return null;
  const cacheKey = query.toLowerCase().trim();
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
    return cached.recipe;
  }

  let recipe: RecipeCardData | null = null;
  try {
    recipe = await scrapeMarmiton(query);
    if (!recipe) {
      recipe = await scrapeCuisineAZ(query);
    }
  } catch (e) {
    console.error('[recipe] unexpected error', e);
    recipe = null;
  }
  cache.set(cacheKey, { recipe, fetchedAt: Date.now() });
  return recipe;
}
