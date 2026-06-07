import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Cache mémoire 24h
interface CacheEntry {
  photo: string | null;
  source: string | null;
  expiry: number;
}
const photoCache = new Map<string, CacheEntry>();
const CACHE_TTL = 86_400_000; // 24h en ms

// Logger une seule fois pour Unsplash absent
let unsplashWarningLogged = false;

// Helper pour générer une clé de cache simple
function cacheKey(name: string, cuisine?: string, city?: string, category?: string): string {
  const parts = [name, cuisine || '', city || '', category || ''].map(s => s.toLowerCase().trim());
  return JSON.stringify(parts);
}

// Helper pour fetch avec timeout
async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number = 4000): Promise<Response | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    return response;
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

// Helper pour Wikipedia
async function fetchWikipedia(name: string, lang: 'fr' | 'en'): Promise<string | null> {
  const url = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(name)}`;
  const response = await fetchWithTimeout(url, {
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'Talk2MeBot/0.1 (+https://genius-web.fr/talktome)'
    }
  });
  if (!response || !response.ok) return null;
  try {
    const json = await response.json();
    if (json?.thumbnail?.source && typeof json.thumbnail.source === 'string') {
      return json.thumbnail.source;
    }
  } catch {
    // Ignorer les erreurs de parsing JSON
  }
  return null;
}

// Helper pour Unsplash
async function fetchUnsplash(query: string): Promise<string | null> {
  const accessKey = process.env.UNSPLASH_ACCESS_KEY;
  if (!accessKey) {
    if (!unsplashWarningLogged) {
      console.info('[enrich/photo] UNSPLASH_ACCESS_KEY absent, mode placeholder');
      unsplashWarningLogged = true;
    }
    return null;
  }
  const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=1&orientation=landscape`;
  const response = await fetchWithTimeout(url, {
    headers: {
      'Authorization': `Client-ID ${accessKey}`
    }
  });
  if (!response || !response.ok) return null;
  try {
    const json = await response.json();
    if (json?.results?.[0]?.urls?.regular && typeof json.results[0].urls.regular === 'string') {
      return json.results[0].urls.regular;
    }
  } catch {
    // Ignorer les erreurs de parsing JSON
  }
  return null;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const name = searchParams.get('name');
  const cuisine = searchParams.get('cuisine') || undefined;
  const city = searchParams.get('city') || undefined;
  const category = searchParams.get('category') || undefined;

  // Validation : name requis
  if (!name) {
    return NextResponse.json({ photo: null }, { status: 400 });
  }

  // Vérification du cache
  const key = cacheKey(name, cuisine, city, category);
  const cached = photoCache.get(key);
  if (cached && cached.expiry > Date.now()) {
    return NextResponse.json(
      cached.photo ? { photo: cached.photo, source: cached.source } : { photo: null },
      { status: 200 }
    );
  }

  // Hiérarchie de fallback
  let photo: string | null = null;
  let source: string | null = null;

  // 1. Wikipedia FR
  try {
    photo = await fetchWikipedia(name, 'fr');
    if (photo) source = 'wikipedia';
  } catch {
    // Ignorer et passer au suivant
  }

  // 2. Wikipedia EN si FR rate
  if (!photo) {
    try {
      photo = await fetchWikipedia(name, 'en');
      if (photo) source = 'wikipedia';
    } catch {
      // Ignorer et passer au suivant
    }
  }

  // 3. Unsplash si Wikipedia a échoué
  if (!photo) {
    try {
      const query = [cuisine, category || 'restaurant'].filter(Boolean).join(' ').trim();
      if (query) {
        photo = await fetchUnsplash(query);
        if (photo) source = 'unsplash';
      }
    } catch {
      // Ignorer et passer au suivant
    }
  }

  // Pas trouvé → silence (la majorité des restos ne sont pas dans Wikipedia,
  // c'est le cas nominal, pas une erreur).

  // Mise en cache
  photoCache.set(key, {
    photo,
    source,
    expiry: Date.now() + CACHE_TTL
  });

  // Réponse
  return NextResponse.json(
    photo ? { photo, source } : { photo: null },
    { status: 200 }
  );
}
