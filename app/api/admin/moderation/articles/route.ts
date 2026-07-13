/**
 * Talk2Me — API admin MODÉRATION DES PAGES-ENTITÉS SIGNALÉES (M4).
 *
 * File de modération des articles canoniques (pages-entités) signalés par les users.
 * Distinct de la modération users/contenu (../route.ts, lib/moderation.ts) : ici on
 * traite les entités signalées via le moteur de notation lib/cards/engine/ratings.ts.
 *
 * GET  → { items: [{ entityRef, reports, fiable, douteux, score, snippet, lang }] }
 * POST → { entityRef, action:'dismiss'|'delete' }
 *          - dismiss → blanchit les signalements ouverts (dé-flag).
 *          - delete  → supprime l'article canonique PUIS blanchit.
 * Admin STRICT (isAiOpsAdmin), même gate que le reste de app/api/admin.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { isAiOpsAdmin } from '@/lib/ai-ops/auth';
import { listFlagged, dismissReports } from '@/lib/cards/engine/ratings';
import { getArticleMeta, deleteArticle, setArticleState } from '@/lib/cards/engine/article';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function guard(req: NextRequest) {
  const user = getCurrentUserFromRequest(req);
  if (!user) return { error: NextResponse.json({ error: 'unauthorized' }, { status: 401 }) };
  if (!isAiOpsAdmin(user.id, (user as { email?: string }).email))
    return { error: NextResponse.json({ error: 'forbidden' }, { status: 403 }) };
  return { user };
}

/** 1er paragraphe nettoyé (~200 car., retire ** # * `). */
function toSnippet(body: string): string {
  const firstPara = body.split(/\n\s*\n/)[0] || body;
  const clean = firstPara
    .replace(/[*#`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return clean.length > 200 ? clean.slice(0, 200).trimEnd() + '…' : clean;
}

export async function GET(req: NextRequest) {
  const g = guard(req);
  if (g.error) return g.error;
  const flagged = listFlagged(100);
  const items = flagged.map((f) => {
    const meta = getArticleMeta(f.entityRef);
    const snippet = meta ? toSnippet(meta.body) : "(pas d'article canonique)";
    return {
      entityRef: f.entityRef,
      reports: f.reports,
      fiable: f.fiable,
      douteux: f.douteux,
      score: f.score,
      snippet,
      lang: meta?.lang || '',
    };
  });
  return NextResponse.json({ items });
}

export async function POST(req: NextRequest) {
  const g = guard(req);
  if (g.error) return g.error;
  let body: { entityRef?: string; action?: string } = {};
  try {
    body = await req.json();
  } catch {
    /* corps invalide → traité comme manquant */
  }
  const entityRef = typeof body.entityRef === 'string' ? body.entityRef.trim() : '';
  const action = body.action;
  const OK = new Set(['dismiss', 'delete', 'freeze', 'unfreeze']);
  if (!entityRef || !OK.has(action || ''))
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });

  if (action === 'delete') {
    deleteArticle(entityRef);
    dismissReports(entityRef);
  } else if (action === 'freeze') {
    setArticleState(entityRef, 'frozen'); // M5 : gel manuel admin
  } else if (action === 'unfreeze') {
    setArticleState(entityRef, 'developing');
  } else {
    dismissReports(entityRef); // dismiss (blanchir)
  }
  return NextResponse.json({ ok: true });
}
