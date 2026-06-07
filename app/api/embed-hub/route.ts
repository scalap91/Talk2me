import { NextResponse } from 'next/server';
import { buildUnifiedCard } from '@/lib/embed-hub';
import type { UnifiedCard } from '@/lib/embed-hub/types';

/**
 * Universal Embed Hub — endpoint API (Pascal 2026-06-05).
 *
 * GET /api/embed-hub?url=<url>
 *   → { ok: true, card: UnifiedCard, cached?: boolean }
 *
 * Toujours une card retournée (même fallback) ; doctrine
 * `feedback_talktome_no_excuses` : pas d'erreur brute côté client.
 * Les seuls 400 retournés concernent les URLs absentes/invalides.
 *
 * Phase 4 (#389) : cache process-local Map 5 min keyé sur URL pour éviter
 * de re-hammer les oEmbed publics + sub-resolvers à chaque re-render
 * client. Persiste tant que le process Node vit (pas de Redis pour MVP).
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface ServerCacheEntry {
  card: UnifiedCard;
  expiresAt: number;
}

const SERVER_CACHE = new Map<string, ServerCacheEntry>();
const SERVER_CACHE_TTL_MS = 5 * 60 * 1000;
// Fallbacks transitoires (réseau KO, oEmbed timeout) : TTL court 30s pour
// éviter de spam les retries non-stop mais permettre une auto-guérison
// rapide. Doctrine bug #1 audit #413 (Pascal 2026-06-05).
const FALLBACK_CACHE_TTL_MS = 30 * 1000;
// Sources oEmbed fragiles : Reddit JSON, Twitter publish API, Spotify
// oEmbed → TTL 1 min, pas 5 min, pour éviter de figer un titre/thumb
// dégradé si l'API d'origine se ré-ouvre.
const FRAGILE_CACHE_TTL_MS = 60 * 1000;
const FRAGILE_SOURCES = new Set(['reddit', 'twitter', 'spotify']);
const SERVER_CACHE_MAX = 500;

function readServerCache(url: string): UnifiedCard | null {
  const c = SERVER_CACHE.get(url);
  if (!c) return null;
  if (c.expiresAt <= Date.now()) {
    SERVER_CACHE.delete(url);
    return null;
  }
  return c.card;
}

function isFallback(card: UnifiedCard): boolean {
  if (card.source === 'fallback') return true;
  const meta = card.meta as Record<string, unknown> | undefined;
  if (meta && meta.fallback === true) return true;
  return false;
}

function writeServerCache(url: string, card: UnifiedCard) {
  // Eviction LRU light : si full, on vire la première entrée insérée.
  if (SERVER_CACHE.size >= SERVER_CACHE_MAX) {
    const firstKey = SERVER_CACHE.keys().next().value;
    if (firstKey) SERVER_CACHE.delete(firstKey);
  }
  // TTL adaptatif : fallback < fragile < normal. Bug #1 audit #413.
  let ttl = SERVER_CACHE_TTL_MS;
  if (isFallback(card)) ttl = FALLBACK_CACHE_TTL_MS;
  else if (FRAGILE_SOURCES.has(card.source)) ttl = FRAGILE_CACHE_TTL_MS;
  SERVER_CACHE.set(url, { card, expiresAt: Date.now() + ttl });
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const url = searchParams.get('url');
  if (!url) {
    return NextResponse.json(
      { ok: false, reason: 'missing_url' },
      { status: 400 }
    );
  }

  try {
    new URL(url); // validate
  } catch {
    return NextResponse.json(
      { ok: false, reason: 'invalid_url' },
      { status: 400 }
    );
  }

  const cached = readServerCache(url);
  if (cached) {
    return NextResponse.json({ ok: true, card: cached, cached: true });
  }

  const baseUrl = new URL(req.url).origin;
  // Hostname public pour les embeds qui exigent un `parent=` matchant
  // l'Origin réel du browser (Twitch, etc.). Priorité :
  //  1) env NEXT_PUBLIC_APP_DOMAIN (déploiement explicite)
  //  2) x-forwarded-host (nginx)
  //  3) host header
  //  4) fallback talk2me.fr
  // Bug #2 audit #413 (Pascal 2026-06-05).
  const xfHost = req.headers.get('x-forwarded-host');
  const hostHeader = req.headers.get('host');
  const publicHostname =
    process.env.NEXT_PUBLIC_APP_DOMAIN ||
    (xfHost ? xfHost.split(',')[0].trim().split(':')[0] : '') ||
    (hostHeader && !/^(127\.|localhost)/i.test(hostHeader)
      ? hostHeader.split(':')[0]
      : '') ||
    'talk2me.fr';

  const card = await buildUnifiedCard(url, { baseUrl, publicHostname });
  writeServerCache(url, card);
  return NextResponse.json({ ok: true, card, cached: false });
}
