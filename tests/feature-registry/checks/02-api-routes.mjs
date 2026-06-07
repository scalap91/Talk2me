/**
 * Talk2Me #409 — Checks API routes critiques.
 *
 * Pour chaque endpoint : vérifie qu'il existe (pas 404), répond cohérent.
 * Sans cookie → on attend 401/403 sur les routes protégées, 200 sur publiques.
 */

import { safeFetch, expectProtected, DEFAULT_BASE_URL } from '../_helpers.mjs';

async function probeProtected(ctx, method, urlPath, body = null) {
  const base = ctx.fetchUrl || DEFAULT_BASE_URL;
  const init = { method };
  if (body) {
    init.headers = { 'Content-Type': 'application/json' };
    init.body = JSON.stringify(body);
  }
  const r = await safeFetch(`${base}${urlPath}`, init);
  const v = expectProtected(r.status);
  return {
    passed: v.passed,
    duration_ms: r.durMs,
    error: v.passed ? null : (v.error || r.error || `status ${r.status}`),
    evidence: { method, url: urlPath, status: r.status, note: v.note },
  };
}

async function probePublic(ctx, urlPath) {
  const base = ctx.fetchUrl || DEFAULT_BASE_URL;
  const r = await safeFetch(`${base}${urlPath}`);
  // Le middleware Talk2Me redirige souvent les API vers /signin (307). On
  // accepte 200, 307 (auth requise par middleware) et 400 (bad req).
  const ok = r.status === 200 || r.status === 307 || r.status === 308 || r.status === 400;
  return {
    passed: ok,
    duration_ms: r.durMs,
    error: ok ? null : `HTTP ${r.status}`,
    evidence: { url: urlPath, status: r.status },
  };
}

export const CHECKS = [
  // === Posts (public) ===
  { FEATURE: { id: 'api-posts-list' }, run: (ctx) => probePublic(ctx, '/api/posts') },

  // === Cards CRUD (auth requise) ===
  { FEATURE: { id: 'api-cards-reorder-route' }, run: (ctx) => probeProtected(ctx, 'POST', '/api/cards/reorder', { items: [] }) },
  { FEATURE: { id: 'api-cards-mine-auth-required' }, run: (ctx) => probeProtected(ctx, 'GET', '/api/cards/mine') },
  { FEATURE: { id: 'api-cards-liked-auth-required' }, run: (ctx) => probeProtected(ctx, 'GET', '/api/cards/liked') },
  { FEATURE: { id: 'api-cards-saved-auth-required' }, run: (ctx) => probeProtected(ctx, 'GET', '/api/cards/saved') },
  { FEATURE: { id: 'api-cards-trash-auth-required' }, run: (ctx) => probeProtected(ctx, 'GET', '/api/cards/trash') },
  { FEATURE: { id: 'api-card-like-route' }, run: (ctx) => probeProtected(ctx, 'POST', '/api/cards/probe-id-xxx/like') },
  { FEATURE: { id: 'api-card-archive-route' }, run: (ctx) => probeProtected(ctx, 'POST', '/api/cards/probe-id-xxx/archive') },
  { FEATURE: { id: 'api-card-restore-route' }, run: (ctx) => probeProtected(ctx, 'POST', '/api/cards/probe-id-xxx/restore') },

  // === Auth ===
  {
    FEATURE: { id: 'api-auth-me' },
    run: async (ctx) => {
      const base = ctx.fetchUrl || DEFAULT_BASE_URL;
      const r = await safeFetch(`${base}/api/auth/me`);
      // /api/auth/me peut renvoyer 200 avec user:null OU 401
      const passed = r.status === 200 || r.status === 401;
      return {
        passed,
        duration_ms: r.durMs,
        error: passed ? null : `HTTP ${r.status}`,
        evidence: { status: r.status, body_sample: r.text.slice(0, 100) },
      };
    },
  },
  { FEATURE: { id: 'api-auth-magic-link' }, run: (ctx) => probeProtected(ctx, 'POST', '/api/auth/magic-link/request', { email: 'check@invalid.tld' }) },

  // === Chess ===
  { FEATURE: { id: 'api-chess-new' }, run: (ctx) => probeProtected(ctx, 'POST', '/api/chess/new', {}) },
  { FEATURE: { id: 'api-chess-move' }, run: (ctx) => probeProtected(ctx, 'POST', '/api/chess/probe-id/move', { from: 'e2', to: 'e4' }) },
  { FEATURE: { id: 'api-chess-resign' }, run: (ctx) => probeProtected(ctx, 'POST', '/api/chess/probe-id/resign') },

  // === Dame ===
  { FEATURE: { id: 'api-dame-new' }, run: (ctx) => probeProtected(ctx, 'POST', '/api/dame/new', {}) },
  { FEATURE: { id: 'api-dame-move' }, run: (ctx) => probeProtected(ctx, 'POST', '/api/dame/probe-id/move', { from: 'a1', to: 'b2' }) },
  { FEATURE: { id: 'api-dame-resign' }, run: (ctx) => probeProtected(ctx, 'POST', '/api/dame/probe-id/resign') },

  // === Watch Together ===
  { FEATURE: { id: 'api-activities-start' }, run: (ctx) => probeProtected(ctx, 'POST', '/api/activities/start', { conv_id: 'x', kind: 'watch-together' }) },
  { FEATURE: { id: 'api-activities-accept' }, run: (ctx) => probeProtected(ctx, 'POST', '/api/activities/probe-id/accept') },
  { FEATURE: { id: 'api-activities-decline' }, run: (ctx) => probeProtected(ctx, 'POST', '/api/activities/probe-id/decline') },
  { FEATURE: { id: 'api-activities-sync' }, run: (ctx) => probeProtected(ctx, 'POST', '/api/activities/probe-id/sync', { state: 'play' }) },

  // === SFU mediasoup ===
  { FEATURE: { id: 'api-sfu-join-route' }, run: (ctx) => probeProtected(ctx, 'POST', '/api/sfu/join', { room: 'x' }) },
  { FEATURE: { id: 'api-sfu-transport-create' }, run: (ctx) => probeProtected(ctx, 'POST', '/api/sfu/transport/create', { room: 'x' }) },

  // === Friends ===
  { FEATURE: { id: 'api-friends-list' }, run: (ctx) => probeProtected(ctx, 'GET', '/api/friends/list') },
  { FEATURE: { id: 'api-friends-search' }, run: (ctx) => probeProtected(ctx, 'GET', '/api/friends/search?q=test') },
  { FEATURE: { id: 'api-friends-add' }, run: (ctx) => probeProtected(ctx, 'POST', '/api/friends/add', { user_id: 'x' }) },

  // === Conversations ===
  { FEATURE: { id: 'api-conversations-list' }, run: (ctx) => probeProtected(ctx, 'GET', '/api/conversations/list') },
  { FEATURE: { id: 'api-conversations-create-p2p' }, run: (ctx) => probeProtected(ctx, 'POST', '/api/conversations/create-p2p', { peer_id: 'x' }) },

  // === Chat (Léa) ===
  { FEATURE: { id: 'api-chat-route' }, run: (ctx) => probeProtected(ctx, 'POST', '/api/chat', { messages: [] }) },

  // === Embed Hub ===
  {
    FEATURE: { id: 'api-embed-hub-route' },
    run: async (ctx) => {
      const base = ctx.fetchUrl || DEFAULT_BASE_URL;
      // L'endpoint est GET ?url=... (cf app/api/embed-hub/route.ts).
      const r = await safeFetch(`${base}/api/embed-hub?url=${encodeURIComponent('https://www.youtube.com/watch?v=dQw4w9WgXcQ')}`);
      // 200 attendu (always returns a card) ; 400 si URL invalide ; 429 rate limit
      const passed = [200, 400, 429].includes(r.status);
      return {
        passed,
        duration_ms: r.durMs,
        error: passed ? null : `HTTP ${r.status}`,
        evidence: { status: r.status, body_sample: r.text.slice(0, 150) },
      };
    },
  },
];
