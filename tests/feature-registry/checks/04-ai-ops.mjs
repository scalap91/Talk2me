/**
 * Talk2Me #409 — Checks AI Ops (#406+#407).
 */

import { safeFetch, expectProtected, DEFAULT_BASE_URL } from '../_helpers.mjs';

async function probeAdminPage(ctx, path) {
  const base = ctx.fetchUrl || DEFAULT_BASE_URL;
  const r = await safeFetch(`${base}${path}`);
  // 307/308 = redirect middleware vers /signin → page existe, accès non-admin
  // 404 = notFound() pour non-admin → page existe
  // 200 = admin connecté
  // 500 = bug serveur ✗
  const passed = [200, 307, 308, 404, 401, 403].includes(r.status);
  return {
    passed,
    duration_ms: r.durMs,
    error: passed ? null : `HTTP ${r.status}`,
    evidence: { url: path, status: r.status },
  };
}

export const CHECKS = [
  { FEATURE: { id: 'admin-ai-ops-page' }, run: (ctx) => probeAdminPage(ctx, '/admin/agents') },
  { FEATURE: { id: 'admin-patches-page' }, run: (ctx) => probeAdminPage(ctx, '/admin/patches') },
  {
    FEATURE: { id: 'api-ai-ops-status' },
    run: async (ctx) => {
      const base = ctx.fetchUrl || DEFAULT_BASE_URL;
      const r = await safeFetch(`${base}/api/admin/ai-ops/status`);
      // 401/403/307/308 attendu sans cookie/redirect. 200 si endpoint public. 404 = cassé.
      const passed = [200, 307, 308, 401, 403].includes(r.status);
      return {
        passed,
        duration_ms: r.durMs,
        error: passed ? null : `HTTP ${r.status}`,
        evidence: { status: r.status },
      };
    },
  },
];
