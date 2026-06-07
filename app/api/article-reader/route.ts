import { NextRequest, NextResponse } from 'next/server';
import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';
import DOMPurify from 'isomorphic-dompurify';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface ArticleData {
  title: string;
  byline: string | null;
  excerpt: string | null;
  content: string;
  length: number | null;
  siteName: string | null;
  lang: string | null;
  publishedTime: string | null;
  url: string;
}

interface CacheEntry {
  data: ArticleData;
  expiresAt: number;
}

const CACHE = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1h
const FETCH_TIMEOUT_MS = 8000;
const MAX_BODY_SIZE = 2 * 1024 * 1024; // 2 MB

function isPublicUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    const hostname = u.hostname.toLowerCase();
    if (hostname === 'localhost' || hostname.endsWith('.local') || hostname.endsWith('.internal')) return false;
    // IPv4 private ranges
    if (/^127\./.test(hostname)) return false;
    if (/^10\./.test(hostname)) return false;
    if (/^192\.168\./.test(hostname)) return false;
    if (/^172\.(1[6-9]|2[0-9]|3[01])\./.test(hostname)) return false;
    if (/^169\.254\./.test(hostname)) return false; // link-local
    if (/^0\./.test(hostname)) return false;
    // IPv6 loopback / link-local / unique-local
    if (hostname === '::1' || hostname.startsWith('[::1') || hostname.startsWith('fe80:') || hostname.startsWith('fc') || hostname.startsWith('fd')) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const url = req.nextUrl.searchParams.get('url');
  if (!url) {
    return NextResponse.json({ ok: false, reason: 'missing_url' }, { status: 400 });
  }
  if (!isPublicUrl(url)) {
    return NextResponse.json({ ok: false, reason: 'blocked_url' }, { status: 400 });
  }

  // Cache check
  const cached = CACHE.get(url);
  if (cached && cached.expiresAt > Date.now()) {
    return NextResponse.json({ ok: true, data: cached.data, cached: true });
  }

  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Talk2MeBot/1.0; +https://talk2me.fr)',
        Accept: 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
    });
    clearTimeout(t);
    if (!res.ok) {
      return NextResponse.json(
        { ok: false, reason: `fetch_${res.status}` },
        { status: 502 }
      );
    }

    let html = await res.text();
    if (html.length > MAX_BODY_SIZE) {
      html = html.slice(0, MAX_BODY_SIZE);
    }

    const dom = new JSDOM(html, { url });
    const reader = new Readability(dom.window.document);
    const parsed = reader.parse();

    if (!parsed || !parsed.content) {
      return NextResponse.json({ ok: false, reason: 'extract_failed' });
    }

    const sanitized = DOMPurify.sanitize(parsed.content, {
      ALLOWED_TAGS: [
        'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'a', 'img', 'ul', 'ol', 'li',
        'blockquote', 'em', 'strong', 'i', 'b',
        'br', 'figure', 'figcaption', 'pre', 'code', 'hr',
        'span', 'div', 'small', 'sub', 'sup',
        'table', 'thead', 'tbody', 'tr', 'td', 'th',
      ],
      ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'srcset'],
      ALLOW_DATA_ATTR: false,
    });

    const data: ArticleData = {
      title: parsed.title || '',
      byline: parsed.byline ?? null,
      excerpt: parsed.excerpt ?? null,
      content: sanitized,
      length: parsed.length ?? null,
      siteName: parsed.siteName ?? null,
      lang: parsed.lang ?? null,
      publishedTime: parsed.publishedTime ?? null,
      url,
    };

    CACHE.set(url, { data, expiresAt: Date.now() + CACHE_TTL_MS });
    return NextResponse.json({ ok: true, data });
  } catch (e: unknown) {
    const err = e as { name?: string; message?: string };
    const reason = err?.name === 'AbortError' ? 'timeout' : (err?.message || 'error');
    return NextResponse.json({ ok: false, reason }, { status: 500 });
  }
}
