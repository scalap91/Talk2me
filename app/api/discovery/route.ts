/**
 * Endpoint Discovery pour le NATIF (Pascal 2026-08-30) — renvoie les SCÈNES prêtes (couvertures dérivées
 * côté serveur) du profil <u>. Le natif Flutter les rend à l'identique du web. PUBLIC (le profil /u/ est
 * public) ; si un cookie de session est présent, on personnalise (viewer + « c'est moi » pour la parade).
 * GET /api/discovery?u=<username>
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { buildDiscoveryScenes } from '@/lib/discovery-scenes';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const username = req.nextUrl.searchParams.get('u')?.trim() || '';
  if (!username) return NextResponse.json({ error: 'bad_query' }, { status: 400 });
  const me = getCurrentUserFromRequest(req);
  const payload = buildDiscoveryScenes(username, me?.id, !!me && me.username === username);
  if (!payload.user) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.json(payload);
}
