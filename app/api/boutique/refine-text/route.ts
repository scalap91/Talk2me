/**
 * Talk2Me — POST /api/boutique/refine-text  { text } → { refined, changed }
 * Reformule proprement la description écrite par le vendeur, sans rien ajouter
 * ni retirer (Pascal 2026-06-11). Auth requise.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { refineDescription } from '@/lib/boutique/refine-text';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => null);
  const text = body && typeof body.text === 'string' ? body.text : '';
  if (!text.trim()) return NextResponse.json({ error: 'empty' }, { status: 400 });
  const { refined, changed } = await refineDescription(text.slice(0, 600));
  return NextResponse.json({ ok: true, refined, changed });
}
