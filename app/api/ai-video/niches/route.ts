/**
 * Studio Vidéo IA — POST /api/ai-video/niches (Pascal 2026-06-11).
 * L'IA propose des niches YouTube faceless rentables (océan bleu). Body
 * optionnel : { theme, count }. Réponse : { niches: [...] }.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { proposeNiches } from '@/lib/ai-video/niches';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const user = getCurrentUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  let body: { theme?: string; count?: number } = {};
  try { body = await req.json(); } catch { /* défauts */ }
  const niches = await proposeNiches(body.theme, body.count || 6);
  return NextResponse.json({ niches });
}
