/**
 * Clés IA par user (BYOK) — Pascal 2026-06-11.
 * GET    → statut masqué (présence + 4 derniers car.), JAMAIS la clé en clair.
 * POST   → { provider: 'elevenlabs'|'pexels', key } enregistre (chiffré).
 * DELETE → ?provider=... supprime.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { setAiKey, deleteAiKey, listAiKeyStatus, AI_PROVIDERS, type AiProvider } from '@/lib/ai-keys';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const user = getCurrentUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  return NextResponse.json({ status: listAiKeyStatus(user.id) });
}

export async function POST(req: NextRequest) {
  const user = getCurrentUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  let body: { provider?: string; key?: string } = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'bad_body' }, { status: 400 }); }
  const provider = body.provider as AiProvider;
  if (!AI_PROVIDERS.includes(provider)) return NextResponse.json({ error: 'bad_provider' }, { status: 400 });
  if (!body.key || !body.key.trim()) return NextResponse.json({ error: 'key_required' }, { status: 400 });
  setAiKey(user.id, provider, body.key);
  return NextResponse.json({ ok: true, status: listAiKeyStatus(user.id) });
}

export async function DELETE(req: NextRequest) {
  const user = getCurrentUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const provider = new URL(req.url).searchParams.get('provider') as AiProvider;
  if (!AI_PROVIDERS.includes(provider)) return NextResponse.json({ error: 'bad_provider' }, { status: 400 });
  deleteAiKey(user.id, provider);
  return NextResponse.json({ ok: true, status: listAiKeyStatus(user.id) });
}
