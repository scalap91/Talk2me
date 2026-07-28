/**
 * POST /api/transport/handoff-photo — photo prise à un passage de main (dépôt / prise en charge /
 * livraison / retrait). Preuve d'état du colis (chaîne de garde). Stockée en privé (data/handoff/),
 * jamais servie publiquement ; renvoie un id opaque référencé dans l'événement du colis.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { randomUUID } from 'crypto';
import { mkdirSync, writeFileSync } from 'fs';
import path from 'path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DIR = path.join(process.cwd(), 'data', 'handoff');
const MAX = 8 * 1024 * 1024;
const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

export async function POST(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  let form: FormData;
  try { form = await req.formData(); } catch { return NextResponse.json({ error: 'bad_form' }, { status: 400 }); }
  const file = form.get('file');
  if (!(file instanceof File)) return NextResponse.json({ error: 'no_file' }, { status: 400 });
  if (file.size > MAX) return NextResponse.json({ error: 'file_too_large' }, { status: 413 });
  const ext = EXT[file.type];
  if (!ext) return NextResponse.json({ error: 'bad_type' }, { status: 415 });
  try {
    mkdirSync(DIR, { recursive: true });
    const id = `${me.id}_${randomUUID()}.${ext}`;
    writeFileSync(path.join(DIR, id), Buffer.from(await file.arrayBuffer()), { mode: 0o600 });
    return NextResponse.json({ ok: true, id });
  } catch {
    return NextResponse.json({ error: 'store_failed' }, { status: 500 });
  }
}
