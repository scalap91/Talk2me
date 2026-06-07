/**
 * POST /api/users/me/ai-gender { ai_gender: 'feminin' | 'masculin' | 'neutre' }
 * Talk2Me #325 — Permet à l'user de choisir le genre de son IA personnelle.
 * Le genre est passé au system prompt DeepSeek pour que l'IA accorde
 * (ravi/ravie, prêt/prête, ton assistant/ton assistante…).
 *
 * Doctrine [[talk2me-ia-personnelle-integree]] — l'IA est CONSCIENTE de son
 * genre via system prompt dynamique. Si user change le genre → l'IA sait
 * dès le prochain message.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { updateAiGender, AI_GENDER_VALUES } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const me = getCurrentUserFromRequest(request);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let body: { ai_gender?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }
  const gender = body.ai_gender;
  if (
    gender !== 'feminin' &&
    gender !== 'masculin' &&
    gender !== 'neutre'
  ) {
    return NextResponse.json(
      {
        error: 'ai_gender_invalid',
        allowed: AI_GENDER_VALUES,
      },
      { status: 400 }
    );
  }
  try {
    updateAiGender(me.id, gender);
  } catch (e) {
    const msg = (e as Error).message || 'invalid';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
  return NextResponse.json({ ok: true, ai_gender: gender });
}
