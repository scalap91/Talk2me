/**
 * GET /api/schema/diag — centre de diagnostic du cockpit (DEV ONLY, Pascal 2026-06-30).
 *  ?target=KEY  → exécute UN test réel et renvoie le résultat.
 *  ?all=1       → exécute tous les tests (séquentiel).
 *  (aucun)      → renvoie la liste des cibles + l'historique récent (derniers appels).
 * Gated dev : 404 hors dev.talk2me.fr (même garde que la boussole). Ne renvoie jamais
 * la valeur d'une clé, seulement sa présence.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { DIAG_TARGETS, runDiag, recentDiag, isDevDiag } from '@/lib/schema/diag';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { effectiveCockpitRole } from '@/lib/schema/access';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  if (!isDevDiag()) return new NextResponse('Not found', { status: 404 });
  // BINDING AUTH : un rôle cockpit (donc une session valide) est requis.
  const me = getCurrentUserFromRequest(req);
  if (!effectiveCockpitRole(me)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const url = new URL(req.url);
  const target = url.searchParams.get('target');
  const all = url.searchParams.get('all');

  if (target) {
    const result = await runDiag(target);
    return NextResponse.json({ result });
  }
  if (all) {
    const results = [];
    for (const t of DIAG_TARGETS) results.push(await runDiag(t.key));
    return NextResponse.json({ results });
  }
  return NextResponse.json({
    targets: DIAG_TARGETS.map(({ key, label, module, kind, env, note }) => ({ key, label, module, kind, env, note })),
    recent: recentDiag(),
  });
}
