import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { listProjectsForOwner } from '@/lib/cards/project/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const flagOff = () => process.env.SUPERCARD_PROJECT_V1 !== '1';

/**
 * GET /api/project/mine — LISTE des projets du user connecté (page 1 du composer :
 * retrouver ses films, avec stylo + poubelle). Le FICHIER `.card` est la source ; ceci en est le reflet.
 */
export async function GET(req: NextRequest) {
  if (flagOff()) return NextResponse.json({ error: 'disabled' }, { status: 404 });
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const projects = await listProjectsForOwner(me.id);
  return NextResponse.json({ projects });
}
