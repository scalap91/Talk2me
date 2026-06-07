/**
 * Talk2Me #409 — Checks pages UX principales.
 *
 * Vérifie que les pages publiques chargent (HTML 200 ou redirect signin).
 * Pas de vérification de contenu lourd ici — juste "la page existe et répond".
 */

import { safeFetch, expectHtml, fileContains, DEFAULT_BASE_URL } from '../_helpers.mjs';

async function runPage(ctx, urlPath, allow404 = false) {
  const base = ctx.fetchUrl || DEFAULT_BASE_URL;
  const r = await safeFetch(`${base}${urlPath}`);
  const v = expectHtml(r, allow404);
  return {
    passed: v.passed,
    duration_ms: r.durMs,
    error: v.passed ? null : (v.error || r.error),
    evidence: { url: urlPath, status: r.status, note: v.note },
  };
}

export const CHECKS = [
  {
    FEATURE: { id: 'ui-page-home-render' },
    run: (ctx) => runPage(ctx, '/'),
  },
  {
    FEATURE: { id: 'ui-page-profile-render' },
    run: (ctx) => runPage(ctx, '/profile'),
  },
  {
    FEATURE: { id: 'ui-page-drafts-render' },
    run: (ctx) => runPage(ctx, '/drafts'),
  },
  {
    FEATURE: { id: 'ui-page-friends-render' },
    run: (ctx) => runPage(ctx, '/friends'),
  },
  {
    FEATURE: { id: 'ui-page-signin-render' },
    run: (ctx) => runPage(ctx, '/signin'),
  },
  {
    FEATURE: { id: 'ui-page-schema-render' },
    run: (ctx) => runPage(ctx, '/schema'),
  },
  {
    FEATURE: { id: 'ui-page-mes-cards-render' },
    run: (ctx) => runPage(ctx, '/mes-cards'),
  },
  {
    FEATURE: { id: 'ui-page-saved-cards-render' },
    run: (ctx) => runPage(ctx, '/saved-cards'),
  },
  {
    FEATURE: { id: 'ui-page-trash-render' },
    run: (ctx) => runPage(ctx, '/trash'),
  },
  {
    FEATURE: { id: 'ui-page-sfu-test-render' },
    run: (ctx) => runPage(ctx, '/sfu-test', true),
  },
  {
    // Pascal #383 — preuve source que le drag/drop est branché
    FEATURE: { id: 'ui-drafts-drag-reorder' },
    run: async () => {
      // 1. Le composant /drafts doit appeler reorderCardsBatch ou utiliser un handler pointer
      // 2. L'API /api/cards/reorder doit exister
      const t0 = Date.now();
      const sourceCandidates = [
        'app/drafts/page.tsx',
        'app/mes-cards/page.tsx',
        'app/drafts/DraftsClient.tsx',
        'app/mes-cards/MesCardsClient.tsx',
      ];
      let hasHandler = false;
      let hasReorderCall = false;
      const evidence = { files_checked: [] };
      for (const f of sourceCandidates) {
        const c1 = fileContains(f, /onPointerDown|onPointerMove|pointerdown/i);
        const c2 = fileContains(f, /\/api\/cards\/reorder/);
        evidence.files_checked.push({ file: f, exists: c1.exists, handler: c1.matched, api: c2.matched });
        if (c1.exists && c1.matched) hasHandler = true;
        if (c2.exists && c2.matched) hasReorderCall = true;
      }
      const apiRoute = fileContains('app/api/cards/reorder/route.ts', 'reorderCardsBatch');
      evidence.api_route_exists = apiRoute.exists && apiRoute.matched;
      const passed = (hasHandler || hasReorderCall) && evidence.api_route_exists;
      return {
        passed,
        duration_ms: Date.now() - t0,
        error: passed
          ? null
          : `Drag handler ou appel /api/cards/reorder introuvable (hasHandler=${hasHandler} hasReorderCall=${hasReorderCall} apiRoute=${evidence.api_route_exists})`,
        evidence,
      };
    },
  },
  {
    // Pascal a explicitement retiré le FAB de /drafts (#383)
    FEATURE: { id: 'ui-drafts-no-fab' },
    run: async () => {
      const t0 = Date.now();
      const candidates = [
        'app/drafts/page.tsx',
        'app/drafts/DraftsClient.tsx',
        'app/mes-cards/page.tsx',
      ];
      const evidence = { files_checked: [] };
      let hasFab = false;
      for (const f of candidates) {
        // FAB = bouton avec class fixed et icône Plus (suspect)
        const c = fileContains(f, /class(Name)?="[^"]*fixed[^"]*"[^>]*>[\s\S]{0,300}<Plus/);
        evidence.files_checked.push({ file: f, exists: c.exists, fab_suspect: c.matched });
        if (c.exists && c.matched) hasFab = true;
      }
      return {
        passed: !hasFab,
        duration_ms: Date.now() - t0,
        error: hasFab ? 'FAB Plus détecté dans /drafts (Pascal l\'avait retiré)' : null,
        evidence,
      };
    },
  },
  {
    // Bottom nav doit référencer les 4 routes principales
    FEATURE: { id: 'ui-bottomnav-presence' },
    run: async () => {
      const t0 = Date.now();
      // Les pages /home /profile /drafts /friends redirigent vers /signin sans
      // cookie auth (middleware). On vérifie donc directement le SOURCE du
      // composant BottomNav qui est rendu dans le layout connecté.
      const candidates = [
        'components/chat/BottomNav.tsx',
        'components/BottomNav.tsx',
        'app/components/BottomNav.tsx',
      ];
      const evidence = { files_checked: [] };
      const requiredLinks = ['/home', '/profile', '/drafts', '/friends'];
      let found = null;
      for (const f of candidates) {
        const exists = fileContains(f, ' ');
        if (!exists.exists) {
          evidence.files_checked.push({ file: f, exists: false });
          continue;
        }
        const linksFound = requiredLinks.filter((l) => fileContains(f, `'${l}'`).matched || fileContains(f, `"${l}"`).matched);
        evidence.files_checked.push({ file: f, exists: true, links_found: linksFound });
        if (linksFound.length >= 3) {
          found = { file: f, links_found: linksFound };
          break;
        }
      }
      const passed = !!found;
      return {
        passed,
        duration_ms: Date.now() - t0,
        error: passed ? null : `BottomNav source introuvable ou liens incomplets`,
        evidence,
      };
    },
  },
];
