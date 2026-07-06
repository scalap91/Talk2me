/**
 * GET /api/card-file/<id> → sert le `.card` comme un FICHIER envoyable (Pascal 2026-07-03).
 * Source : le fichier public/cards/<id>.card ; fallback = l'index moteur. Public (whitelisté),
 * sans PII. C'est le « on peut l'envoyer » — un document autonome, partageable comme un PDF.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { readCardFileRaw, cardFilePath } from '@/lib/cards/card-file';
import { getDb } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Le lecteur lit le `.card` (l'ARTEFACT), jamais le moteur. Source : le fichier `.card`,
// sinon le `.card` inline stocké sur la card (dotcard). Aucune dépendance à une table moteur.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const download = new URL(req.url).searchParams.get('download') === '1';
  const headers = {
    'Content-Type': 'application/vnd.t2m.card+json',
    'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${id}.card"`,
    'Cache-Control': 'no-store',
  };

  // 1) le fichier `.card` (l'artefact autonome). On renvoie AUSSI où il est stocké.
  const file = await readCardFileRaw(id);
  if (file) {
    const loc = (await cardFilePath(id)) || 'data/cards';
    return new Response(file, { status: 200, headers: { ...headers, 'X-Card-Location': loc } });
  }

  // 2) le `.card` inline stocké sur la card (direct_cards / annonces).
  try {
    const db = getDb();
    const dc = db.prepare('SELECT dotcard FROM direct_cards WHERE id = ?').get(id) as { dotcard?: string | null } | undefined;
    if (dc?.dotcard) return new Response(dc.dotcard, { status: 200, headers: { ...headers, 'X-Card-Location': 'inline (dotcard sur la card)' } });
  } catch { /* */ }

  return NextResponse.json({ error: 'not_found' }, { status: 404 });
}
