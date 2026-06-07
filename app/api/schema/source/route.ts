/**
 * Talk2Me #408b — /api/schema/source (Pascal 2026-06-05).
 *
 * Renvoie le contenu d'un fichier source du repo (tronqué à 500 lignes) pour
 * affichage dans la Boussole technique (/schema/[id]).
 *
 * Sécurité :
 *   - Le path demandé est résolu sous process.cwd() : tout évadé renvoie 400.
 *   - On n'expose QUE des fichiers listés comme `files` d'un module dans
 *     lib/schema/modules.ts (whitelist stricte) → garantit qu'on ne sert pas
 *     /etc/passwd ni .env même si on déjouait le resolve.
 *
 * PUBLIC : /schema est public (whitelist middleware), donc cette route doit
 * l'être aussi. Aucun secret ne doit traîner dans les fichiers whitelistés.
 */

import { NextResponse } from 'next/server';
import { MODULES } from '@/lib/schema/modules';
import { readModuleSource, extractImports } from '@/lib/schema/source-reader';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Construction de la whitelist au boot. Set pour lookup O(1).
const WHITELIST = new Set<string>();
for (const m of MODULES) {
  for (const f of m.files) {
    WHITELIST.add(f);
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const path = url.searchParams.get('path') || '';
  if (!path) {
    return NextResponse.json({ error: 'Missing path' }, { status: 400 });
  }
  if (!WHITELIST.has(path)) {
    return NextResponse.json(
      {
        error: 'Path non whitelisté (non référencé dans aucun module).',
        path,
      },
      { status: 403 },
    );
  }
  const result = await readModuleSource(path);
  const imports = result.content ? extractImports(result.content) : [];
  return NextResponse.json(
    { ...result, imports },
    {
      headers: {
        'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=120',
      },
    },
  );
}
