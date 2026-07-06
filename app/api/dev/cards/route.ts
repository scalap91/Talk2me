/**
 * GET /api/dev/cards — Inspecteur (Pascal 2026-07-03).
 * Liste les cards du MOTEUR (table `cards`) pour l'user courant (ou toutes avec ?all=1),
 * + indique si le FICHIER `.card` durable existe. Preuve directe du modèle Card OS :
 * « le moteur crée les cards, les lecteurs les lisent ». Le détail se lit via /api/card-file/<id>.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { isAdminCapable } from '@/lib/permissions';
import { listCardFiles, readCardFile, cardFilePath } from '@/lib/cards/card-file';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// L'inspecteur liste les FICHIERS `.card` (les cartes autonomes), jamais une table moteur.
export async function GET(request: NextRequest) {
  const me = getCurrentUserFromRequest(request);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  // Outil développeur → ADMIN uniquement (sinon fuite : ?all=1 exposerait les cards de tous).
  if (!isAdminCapable(me.id, me.email)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const all = new URL(request.url).searchParams.get('all') === '1';
  const ids = await listCardFiles();

  const parsed = await Promise.all(
    ids.map(async (id) => {
      const c = await readCardFile(id);
      if (!c) return null;
      if (!all && c.owner !== me.id) return null;
      const cc = c as typeof c & { createdAt?: number };
      return {
        id: c.id,
        title: c.title || '',
        types: c.types ?? [],
        channel: c.channel ?? null,
        state: c.state ?? null,
        owner: c.owner ?? null,
        createdAt: cc.createdAt ?? null,
        path: await cardFilePath(id), // OÙ la carte est stockée
      };
    })
  );
  const list = parsed.filter((x): x is NonNullable<typeof x> => x !== null);

  return NextResponse.json({ total: list.length, owner: me.id, scope: all ? 'all' : 'mine', cards: list });
}
