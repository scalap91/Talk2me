/**
 * Talk2Me — APERÇU d'un post = CAPTURE de la page /card-render (chromium headless).
 * → la recherche affiche EXACTEMENT le rendu du feed (pixel pour pixel). Pascal 2026-06-23.
 * Caché sur disque (data/card-previews/<id>.png), généré une seule fois. Public (non-PII).
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { execFile } from 'child_process';
import { existsSync, mkdirSync, readFileSync, statSync } from 'fs';
import path from 'path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DIR = path.join(process.cwd(), 'data', 'card-previews');
const BASE = process.env.PREVIEW_BASE_URL || 'https://dev.talk2me.fr';
const inFlight = new Set<string>();
// Limite de captures chromium SIMULTANÉES : sinon 24 vignettes = 24 chromium d'un coup =
// serveur à genoux = tout lent. Au-delà → 202 (le client réessaie), capture en file.
const MAX_CONCURRENT = 2;
let running = 0;

function shoot(id: string, out: string): Promise<boolean> {
  return new Promise((resolve) => {
    execFile('chromium-browser', [
      '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
      '--hide-scrollbars', '--force-device-scale-factor=2', '--window-size=600,800',
      '--virtual-time-budget=4500', '--screenshot=' + out,
      `${BASE}/card-render/${encodeURIComponent(id)}`,
    ], { timeout: 30000 }, (err) => resolve(!err && existsSync(out)));
  });
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!id || /[^a-zA-Z0-9_-]/.test(id)) return NextResponse.json({ error: 'bad_id' }, { status: 400 });
  const out = path.join(DIR, id + '.png');

  if (!existsSync(out)) {
    // déjà en cours pour cet id, OU trop de captures simultanées → 202, le client réessaiera.
    if (inFlight.has(id) || running >= MAX_CONCURRENT) return NextResponse.json({ error: 'generating' }, { status: 202 });
    inFlight.add(id); running++;
    try { mkdirSync(DIR, { recursive: true }); await shoot(id, out); } finally { inFlight.delete(id); running--; }
    if (!existsSync(out)) return NextResponse.json({ error: 'render_failed' }, { status: 500 });
  }
  const buf = readFileSync(out);
  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=86400', 'Last-Modified': statSync(out).mtime.toUTCString() },
  });
}
