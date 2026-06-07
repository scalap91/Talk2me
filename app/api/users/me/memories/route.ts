/**
 * /api/users/me/memories — mémoire long terme de l'IA personnelle.
 *
 * Doctrine [[talktome-ia-persistance-isolation]] (Pascal 2026-06-04) :
 *  - Strictement isolé par user_id (auth requise)
 *  - L'IA de Pascal n'accède JAMAIS aux memories de Karim
 *  - Injecté dans le system prompt du call IA P2P (`buildSystemPrompt`)
 *
 * GET  → liste des memories de l'user courant
 * POST → ajoute une memory { content, kind?, source_conv_id?, source_message_id? }
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import {
  addAiMemory,
  getAiMemories,
  deleteAiMemory,
  type AiMemoryKind,
} from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function normalizeKind(v: unknown): AiMemoryKind | undefined {
  if (v === 'preference' || v === 'habit' || v === 'fact' || v === 'style') {
    return v;
  }
  return undefined;
}

export async function GET(request: NextRequest) {
  const me = getCurrentUserFromRequest(request);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const memories = getAiMemories(me.id, 50);
  return NextResponse.json({
    ok: true,
    memories: memories.map((m) => ({
      id: m.id,
      kind: m.kind,
      content: m.content,
      weight: m.weight,
      source_conv_id: m.source_conv_id,
      source_message_id: m.source_message_id,
      created_at: m.created_at,
      last_used_at: m.last_used_at,
    })),
  });
}

export async function POST(request: NextRequest) {
  const me = getCurrentUserFromRequest(request);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let body: {
    content?: unknown;
    kind?: unknown;
    source_conv_id?: unknown;
    source_message_id?: unknown;
    weight?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  const content = typeof body.content === 'string' ? body.content.trim() : '';
  if (!content) {
    return NextResponse.json({ error: 'content_required' }, { status: 400 });
  }
  if (content.length > 500) {
    return NextResponse.json({ error: 'content_too_long' }, { status: 400 });
  }

  try {
    const mem = addAiMemory({
      userId: me.id,
      kind: normalizeKind(body.kind),
      content,
      sourceConvId:
        typeof body.source_conv_id === 'string' ? body.source_conv_id : null,
      sourceMessageId:
        typeof body.source_message_id === 'string' ? body.source_message_id : null,
      weight: typeof body.weight === 'number' ? body.weight : undefined,
    });
    return NextResponse.json({
      ok: true,
      memory: {
        id: mem.id,
        kind: mem.kind,
        content: mem.content,
        weight: mem.weight,
        created_at: mem.created_at,
      },
    });
  } catch (e) {
    const msg = (e as Error).message || 'invalid';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  const me = getCurrentUserFromRequest(request);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { searchParams } = new URL(request.url);
  const id = (searchParams.get('id') || '').trim();
  if (!id) {
    return NextResponse.json({ error: 'id_required' }, { status: 400 });
  }
  const ok = deleteAiMemory(me.id, id);
  return NextResponse.json({ ok });
}
