/**
 * GET /api/formation/content — sert le texte de la formation contributeur (docs/formation-contributeur.md,
 * source unique). RÉSERVÉ aux personnes RECRUTÉES : seul un contributeur (is_contributor) y a accès ;
 * les autres reçoivent 403. Le simulateur (composant) est rendu à part sur la page /formation.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { hasFormationAccess } from '@/lib/formation-access';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  // Gate : la formation n'est ouverte QUE si un VALIDATEUR a ouvert l'accès (lors de sa session).
  if (!hasFormationAccess(me.id)) return NextResponse.json({ error: 'not_opened' }, { status: 403 });
  try {
    const md = await fs.readFile(path.join(process.cwd(), 'docs', 'formation-contributeur.md'), 'utf8');
    return NextResponse.json({ ok: true, markdown: md });
  } catch {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
}
