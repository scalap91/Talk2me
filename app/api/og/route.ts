import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface OgData {
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
  url?: string;
}

interface CacheEntry {
  data: OgData;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const MAX_BODY_SIZE = 200 * 1024; // 200 KB
const FETCH_TIMEOUT_MS = 5000;

function extractMetaTag(html: string, property: string): string | undefined {
  const regex = new RegExp(
    `<meta[^>]+(?:property|name)=["']${escapeRegex(property)}["'][^>]+content=["']([^"']*)["']`,
    'i'
  );
  const match = html.match(regex);
  if (match && match[1]) {
    return match[1].trim();
  }

  // Try reversed attribute order
  const reversedRegex = new RegExp(
    `<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${escapeRegex(property)}["']`,
    'i'
  );
  const reversedMatch = html.match(reversedRegex);
  if (reversedMatch && reversedMatch[1]) {
    return reversedMatch[1].trim();
  }

  return undefined;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractTitleTag(html: string): string | undefined {
  const match = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  if (match && match[1]) {
    return match[1].trim();
  }
  return undefined;
}

function resolveUrl(image: string, base: string): string {
  try {
    return new URL(image, base).href;
  } catch {
    return image;
  }
}

function parseOgData(html: string, baseUrl: string): OgData {
  const data: OgData = {};

  const ogTitle = extractMetaTag(html, 'og:title');
  const twitterTitle = extractMetaTag(html, 'twitter:title');
  const htmlTitle = extractTitleTag(html);
  data.title = ogTitle || twitterTitle || htmlTitle;

  const ogDescription = extractMetaTag(html, 'og:description');
  const twitterDescription = extractMetaTag(html, 'twitter:description');
  data.description = ogDescription || twitterDescription;

  const ogImage = extractMetaTag(html, 'og:image');
  const twitterImage = extractMetaTag(html, 'twitter:image');
  const rawImage = ogImage || twitterImage;
  if (rawImage) {
    data.image = resolveUrl(rawImage, baseUrl);
  }

  const ogSiteName = extractMetaTag(html, 'og:site_name');
  data.siteName = ogSiteName;

  const ogUrl = extractMetaTag(html, 'og:url');
  data.url = ogUrl;

  return data;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const urlParam = request.nextUrl.searchParams.get('url');

  if (!urlParam || !/^https?:\/\//i.test(urlParam)) {
    return NextResponse.json(
      { ok: false, error: 'invalid url' },
      {
        status: 400,
        headers: {
          'Cache-Control': 'public, max-age=3600',
          'Content-Type': 'application/json',
        },
      }
    );
  }

  const now = Date.now();
  const cached = cache.get(urlParam);
  if (cached && cached.expiresAt > now) {
    return NextResponse.json(
      { ok: true, url: urlParam, data: cached.data },
      {
        status: 200,
        headers: {
          'Cache-Control': 'public, max-age=3600',
          'Content-Type': 'application/json',
        },
      }
    );
  }

  try {
    const response = await fetch(urlParam, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        'User-Agent': 'Talk2MeBot/0.1 (+https://genius-web.fr/talktome)',
        Accept: 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
    });

    if (!response.ok) {
      return NextResponse.json(
        { ok: false, error: `HTTP error ${response.status}` },
        {
          status: 200,
          headers: {
            'Cache-Control': 'public, max-age=3600',
            'Content-Type': 'application/json',
          },
        }
      );
    }

    let text = await response.text();
    if (text.length > MAX_BODY_SIZE) {
      text = text.slice(0, MAX_BODY_SIZE);
    }

    const data = parseOgData(text, urlParam);

    cache.set(urlParam, {
      data,
      expiresAt: now + CACHE_TTL_MS,
    });

    return NextResponse.json(
      { ok: true, url: urlParam, data },
      {
        status: 200,
        headers: {
          'Cache-Control': 'public, max-age=3600',
          'Content-Type': 'application/json',
        },
      }
    );
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : 'unknown error';
    return NextResponse.json(
      { ok: false, error: errorMessage },
      {
        status: 200,
        headers: {
          'Cache-Control': 'public, max-age=3600',
          'Content-Type': 'application/json',
        },
      }
    );
  }
}
