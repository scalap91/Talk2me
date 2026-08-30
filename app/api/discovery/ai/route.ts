/**
 * Texte IA du Discovery (Pascal 2026-08-30) — LECTURE du cache (portrait + accroches). La GÉNÉRATION
 * est déclenchée en fond par le SSR (getProfileDiscovery → ensureDiscoveryAI) ; ici on ne fait que LIRE,
 * pour que la 1ʳᵉ visite récupère le texte dès qu'il est prêt (le client poll une fois). PUBLIC (page /u/
 * publique), aucune PII : ne renvoie que des accroches dérivées de contenu déjà public.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getUserByUsername } from '@/lib/db-users';
import { getCachedDiscoveryAI } from '@/lib/discovery-ai';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const username = req.nextUrl.searchParams.get('u')?.trim() || '';
  if (!username) return NextResponse.json({ error: 'bad_query' }, { status: 400 });
  const u = getUserByUsername(username);
  if (!u) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.json({ ai: getCachedDiscoveryAI(u.id) });
}
