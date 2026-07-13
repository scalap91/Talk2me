/**
 * GET /api/version — version DÉPLOYÉE (n° du cache sw talk2me-vN), lue à chaud, jamais cachée.
 * Le VersionGuard compare à la version du bundle chargé (APP_V) → recharge si un déploiement a eu
 * lieu → plus besoin de vider le cache à la main. Pascal 2026-07-13.
 */
import { NextResponse } from 'next/server';
import { readFileSync } from 'fs';
import { join } from 'path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET() {
  let v = '0';
  try {
    const sw = readFileSync(join(process.cwd(), 'public', 'sw.js'), 'utf8');
    const m = sw.match(/talk2me-v(\d+)/);
    if (m) v = m[1];
  } catch { /* défaut 0 */ }
  return NextResponse.json({ v }, { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } });
}
