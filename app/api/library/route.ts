/**
 * BIBLIOTHÈQUE persistée en DB (Pascal 2026-07-17) — les albums/films créés (et achetés)
 * survivent à une réinstallation : liés au compte, plus au seul téléphone.
 * GET  → { items:[{id,variant,dotcard,created_at}] } de l'user.
 * POST { id?, variant, dotcard } → upsert.  DELETE ?id= → retire.
 * Le .card est stocké TEL QUEL (source de vérité) ; l'app le lit via SuperCard.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { getDb } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function ensure() {
  getDb().exec(`CREATE TABLE IF NOT EXISTS user_library (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    variant TEXT NOT NULL,
    dotcard TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )`);
}

export async function GET(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  ensure();
  const items = getDb()
    .prepare('SELECT id, variant, dotcard, created_at FROM user_library WHERE user_id = ? ORDER BY created_at DESC')
    .all(me.id);
  return NextResponse.json({ ok: true, items });
}

export async function POST(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  let body: { id?: string; variant?: string; dotcard?: string } = {};
  try { body = await req.json(); } catch { /* */ }
  if (typeof body.dotcard !== 'string' || body.dotcard.length === 0) return NextResponse.json({ error: 'dotcard_required' }, { status: 400 });
  if (body.dotcard.length > 200000) return NextResponse.json({ error: 'too_large' }, { status: 400 });
  ensure();
  const id = (typeof body.id === 'string' && body.id.length > 0) ? body.id : `lib_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  const variant = ['album', 'film', 'pub'].includes(body.variant || '') ? body.variant! : 'album';
  getDb().prepare('INSERT OR REPLACE INTO user_library (id, user_id, variant, dotcard, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(id, me.id, variant, body.dotcard, Date.now());
  return NextResponse.json({ ok: true, id });
}

export async function DELETE(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const id = new URL(req.url).searchParams.get('id') || '';
  ensure();
  getDb().prepare('DELETE FROM user_library WHERE id = ? AND user_id = ?').run(id, me.id);
  return NextResponse.json({ ok: true });
}
