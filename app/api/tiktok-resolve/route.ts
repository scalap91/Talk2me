import { NextResponse } from 'next/server';

/**
 * Talk2Me — TikTok shortcode resolver (Pascal 2026-06-04).
 *
 * Bug live : Pascal partage `https://vm.tiktok.com/ZNRv1WvPW/` (shortcode TikTok)
 * dans une conv. TikTokEmbed reçoit le shortcode comme `videoId`, mais le
 * script officiel `tiktok.com/embed.js` exige un `data-video-id` NUMÉRIQUE
 * (ex: `7234567890123456789`). Résultat : l'embed ne charge pas, fallback
 * `ArticlePreview` générique "TikTok - Make Your Day".
 *
 * Ce endpoint suit le redirect 301/302 de `vm.tiktok.com/<short>` (ou
 * `tiktok.com/t/<short>`) vers l'URL longue `tiktok.com/@user/video/<id>`,
 * en extrait `user` + `video_id`, et retourne le tout au client.
 *
 * Cache 24h : les shortcodes TikTok sont stables (jamais réutilisés pour
 * une autre vidéo), pas besoin d'invalider plus souvent.
 *
 * Doctrine SSRF : on ne fetch QUE des hosts TikTok (whitelist par regex).
 * Pas de fetch arbitraire d'URL utilisateur.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface ResolvedData {
  user: string;
  video_id: string;
  original_url: string;
  short_url?: string;
}

interface CacheEntry {
  data: ResolvedData;
  expiresAt: number;
}

const CACHE = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const FETCH_TIMEOUT_MS = 5000;

const SHORTCODE_PATTERNS = [
  /^https?:\/\/(?:www\.)?vm\.tiktok\.com\/([a-zA-Z0-9]+)\/?/,
  /^https?:\/\/(?:www\.)?tiktok\.com\/t\/([a-zA-Z0-9]+)\/?/,
];

const LONG_URL_PATTERN = /tiktok\.com\/@([^/?#]+)\/video\/(\d+)/;

export async function GET(req: Request): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);
  const url = searchParams.get('url');
  if (!url) {
    return NextResponse.json(
      { ok: false, reason: 'missing_url' },
      { status: 400 }
    );
  }

  // Si l'URL est déjà longue (numérique), pas besoin de fetch.
  const directMatch = url.match(LONG_URL_PATTERN);
  if (directMatch) {
    return NextResponse.json({
      ok: true,
      data: {
        user: directMatch[1],
        video_id: directMatch[2],
        original_url: url,
      },
    });
  }

  // Sinon, on exige un shortcode TikTok (whitelist SSRF).
  const isShortcode = SHORTCODE_PATTERNS.some((p) => p.test(url));
  if (!isShortcode) {
    return NextResponse.json(
      { ok: false, reason: 'not_tiktok_shortcode' },
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

    // 1) Essai HEAD : suit les redirects sans télécharger le body.
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

    // 2) TikTok bloque parfois HEAD → fallback GET (Range:0-0 pour limiter).
    if (!res || !res.ok || !res.url) {
      res = await fetch(url, {
        method: 'GET',
        redirect: 'follow',
        headers: { ...headers, Range: 'bytes=0-0' },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
    }

    const finalUrl = res.url || '';
    const match = finalUrl.match(LONG_URL_PATTERN);
    if (!match) {
      return NextResponse.json(
        {
          ok: false,
          reason: 'no_video_id_in_resolved_url',
          resolved_url: finalUrl,
        },
        { status: 200 }
      );
    }

    const data: ResolvedData = {
      user: match[1],
      video_id: match[2],
      original_url: finalUrl,
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
