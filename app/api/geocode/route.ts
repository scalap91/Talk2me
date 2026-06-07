import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Cache mémoire — TTL 1h. Clé = ville lowercased.
interface GeocodeResult {
  lat: number;
  lng: number;
  display_name: string;
}
interface GeocodeError {
  error: 'not_found';
}
type GeocodePayload = GeocodeResult | GeocodeError;

const cache = new Map<string, { data: GeocodePayload; expiry: number }>();
const CACHE_TTL = 3_600_000; // 1h

interface NominatimItem {
  lat?: string;
  lon?: string;
  display_name?: string;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const cityParam = request.nextUrl.searchParams.get('city')?.trim() || '';

    if (!cityParam || cityParam.length > 100) {
      return NextResponse.json({ error: 'bad_query' }, { status: 400 });
    }

    const cacheKey = cityParam.toLowerCase();
    const cached = cache.get(cacheKey);
    if (cached && cached.expiry > Date.now()) {
      return NextResponse.json(cached.data, { status: 200 });
    }

    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
      cityParam
    )}&limit=1`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Talk2MeBot/0.1 (+https://genius-web.fr/talktome)',
          'Accept-Language': 'fr,en;q=0.9',
        },
      });

      if (response.status === 429) {
        return NextResponse.json({ error: 'rate_limited' }, { status: 200 });
      }
      if (!response.ok) {
        console.error('[geocode] HTTP error:', response.status);
        return NextResponse.json({ error: 'not_found' }, { status: 200 });
      }

      const data = (await response.json()) as NominatimItem[];
      if (!Array.isArray(data) || data.length === 0) {
        const notFound: GeocodeError = { error: 'not_found' };
        cache.set(cacheKey, { data: notFound, expiry: Date.now() + CACHE_TTL });
        return NextResponse.json(notFound, { status: 200 });
      }

      const item = data[0];
      const lat = parseFloat(item.lat ?? '');
      const lng = parseFloat(item.lon ?? '');
      const displayName = item.display_name ?? cityParam;

      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        const notFound: GeocodeError = { error: 'not_found' };
        cache.set(cacheKey, { data: notFound, expiry: Date.now() + CACHE_TTL });
        return NextResponse.json(notFound, { status: 200 });
      }

      const result: GeocodeResult = { lat, lng, display_name: displayName };
      cache.set(cacheKey, { data: result, expiry: Date.now() + CACHE_TTL });
      return NextResponse.json(result, { status: 200 });
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (e) {
    console.error('[geocode]', e);
    return NextResponse.json({ error: 'not_found' }, { status: 200 });
  }
}
