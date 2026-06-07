/**
 * POST /api/users/me/ai-name { ai_name: string }
 * Talk2Me #324 — Permet à l'user de customiser le nom de son IA personnelle
 * (Léa par défaut, Nova, Sora, etc.).
 *
 * Doctrine [[talk2me-ia-personnelle-integree]] : ownership IA — chaque user
 * possède SA propre IA avec UN nom. Le tag dans le fil (@Léa, @Nova) déclenche
 * l'IA du user qui envoie.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { updateAiName } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const me = getCurrentUserFromRequest(request);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let body: { ai_name?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }
  const aiName = typeof body.ai_name === 'string' ? body.ai_name.trim() : '';
  if (!aiName) {
    return NextResponse.json({ error: 'ai_name_required' }, { status: 400 });
  }
  try {
    updateAiName(me.id, aiName);
  } catch (e) {
    const msg = (e as Error).message || 'invalid';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
  return NextResponse.json({ ok: true, ai_name: aiName });
}
