import { NextResponse } from 'next/server';

/**
 * Talk2Me — Facebook share resolver (Pascal 2026-06-05).
 *
 * Bug live : Pascal partage `https://www.facebook.com/share/1NWY1kTu3v/` (lien
 * de partage natif de l'app FB). Le plugin officiel `facebook.com/plugins/*`
 * exige une URL longue canonique (`/<user>/posts/<id>`, `/<user>/videos/<id>`,
 * `/watch?v=<id>`, etc.). Les URLs `share/*` et `fb.watch/*` redirigent vers
 * la canonique : on suit le redirect côté serveur et on retourne l'URL longue.
 *
 * Cache 24h : les shortcodes share/<token> sont stables (jamais réutilisés).
 *
 * Doctrine SSRF : on ne fetch QUE des hosts Facebook (whitelist).
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type FacebookType = 'post' | 'video' | 'reel' | 'photo';

interface ResolvedData {
  original_url: string;
  type: FacebookType;
  short_url?: string;
}

interface CacheEntry {
  data: ResolvedData;
  expiresAt: number;
}

const CACHE = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const FETCH_TIMEOUT_MS = 5000;

const SHARE_PATTERNS = [
  /^https?:\/\/(?:www\.|m\.)?facebook\.com\/share(?:\/[vpr])?\/[a-zA-Z0-9]+\/?/i,
  /^https?:\/\/fb\.watch\/[a-zA-Z0-9_-]+\/?/i,
];

const FB_HOSTS_WHITELIST = new Set([
  'facebook.com',
  'www.facebook.com',
  'm.facebook.com',
  'web.facebook.com',
  'fb.watch',
]);

function detectType(finalUrl: string): FacebookType {
  if (/\/videos?\//i.test(finalUrl) || /\/watch\/?\?v=/i.test(finalUrl)) return 'video';
  if (/\/reel\//i.test(finalUrl)) return 'reel';
  if (/\/photos?\//i.test(finalUrl) || /photo\.php/i.test(finalUrl)) return 'photo';
  return 'post';
}

export async function GET(req: Request): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);
  const url = searchParams.get('url');
  if (!url) {
    return NextResponse.json(
      { ok: false, reason: 'missing_url' },
      { status: 400 }
    );
  }

  // Si l'URL est déjà longue (host FB et pas un /share/*), pas besoin de fetch.
  let parsedInput: URL;
  try {
    parsedInput = new URL(url);
  } catch {
    return NextResponse.json(
      { ok: false, reason: 'invalid_url' },
      { status: 400 }
    );
  }

  const isShare = SHARE_PATTERNS.some((p) => p.test(url));
  if (!isShare) {
    if (FB_HOSTS_WHITELIST.has(parsedInput.host)) {
      return NextResponse.json({
        ok: true,
        data: {
          original_url: url,
          type: detectType(url),
        },
      });
    }
    return NextResponse.json(
      { ok: false, reason: 'not_fb_share' },
      { status: 200 }
    );
  }

  // Cache hit
  const cached = CACHE.get(url);
  if (cached && cached.expiresAt > Date.now()) {
    return NextResponse.json({ ok: true, data: cached.data, cached: true });
  }

  try {
    const headers = {
      'User-Agent': 'Mozilla/5.0 (compatible; Talk2MeBot/1.0)',
      Accept: 'text/html,application/xhtml+xml',
    };

    // 1) Essai HEAD : suit les redirects sans body.
    let res: Response | null = null;
    try {
      res = await fetch(url, {
        method: 'HEAD',
        redirect: 'follow',
        headers,
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
    } catch {
      res = null;
    }

    // 2) Fallback GET si HEAD échoue (FB bloque parfois HEAD).
    if (!res || !res.ok || !res.url) {
      res = await fetch(url, {
        method: 'GET',
        redirect: 'follow',
        headers: { ...headers, Range: 'bytes=0-0' },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
    }

    const finalUrl = res.url || '';
    let finalHost = '';
    try {
      finalHost = new URL(finalUrl).host;
    } catch {
      return NextResponse.json(
        { ok: false, reason: 'invalid_resolved_url', resolved_url: finalUrl },
        { status: 200 }
      );
    }

    if (!FB_HOSTS_WHITELIST.has(finalHost)) {
      return NextResponse.json(
        {
          ok: false,
          reason: 'unexpected_redirect_host',
          resolved_url: finalUrl,
        },
        { status: 200 }
      );
    }

    const data: ResolvedData = {
      original_url: finalUrl,
      type: detectType(finalUrl),
      short_url: url,
    };
    CACHE.set(url, { data, expiresAt: Date.now() + CACHE_TTL_MS });
    return NextResponse.json({ ok: true, data });
  } catch (e: unknown) {
    const err = e as { name?: string; message?: string };
    const isTimeout =
      err.name === 'AbortError' || err.name === 'TimeoutError';
    return NextResponse.json(
      { ok: false, reason: isTimeout ? 'timeout' : 'error' },
      { status: 200 }
    );
  }
}
