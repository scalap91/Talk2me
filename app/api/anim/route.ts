/**
 * Talk2Me — /api/anim (Pascal 2026-06-14).
 * Gestionnaire de bibliothèque d'animations. Le système s'adapte AUX fichiers :
 * - GET  : liste les fichiers d'anim présents dans /uploads (.fbx/.glb/.vrma),
 *          + le mapping action→fichier persisté.
 * - POST : enregistre le mapping { action: filename }.
 * Les noms d'origine Mixamo sont conservés (ex. "Hip Hop Dancing.fbx").
 * Doctrine [[project_talk2me_avatar_architecture]] : Mixamo = anims, VRM = avatars.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { readdir, readFile, writeFile, mkdir, stat } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UPLOADS = '/home/ubuntu/talktome/public/uploads';
const MAP_FILE = '/home/ubuntu/talktome/data/anim-mapping.json';

// fichiers à NE PAS proposer comme animation (ce sont des avatars/modèles)
const NOT_ANIM = /^(9f6139bc|lea-identity|combo-real|avatar-male)/i;

async function readMapping(): Promise<Record<string, string>> {
  try { return JSON.parse(await readFile(MAP_FILE, 'utf8')); } catch { return {}; }
}

export async function GET() {
  let files: { name: string; size: number; ext: string }[] = [];
  try {
    const names = await readdir(UPLOADS);
    for (const n of names) {
      const ext = path.extname(n).toLowerCase();
      if (!['.fbx', '.glb', '.vrma'].includes(ext)) continue;
      if (NOT_ANIM.test(n)) continue;            // exclut les avatars
      let size = 0; try { size = (await stat(path.join(UPLOADS, n))).size; } catch { /* */ }
      files.push({ name: n, size, ext });
    }
  } catch { /* */ }
  files = files.sort((a, b) => a.name.localeCompare(b.name));
  return NextResponse.json({ ok: true, files, mapping: await readMapping() });
}

export async function POST(req: NextRequest) {
  let body: { mapping?: Record<string, string> };
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, error: 'json' }, { status: 400 }); }
  const mapping = body.mapping || {};
  // garde seulement des paires string→string propres
  const clean: Record<string, string> = {};
  for (const [k, v] of Object.entries(mapping)) if (typeof v === 'string' && v) clean[k] = v;
  try {
    if (!existsSync(path.dirname(MAP_FILE))) await mkdir(path.dirname(MAP_FILE), { recursive: true });
    await writeFile(MAP_FILE, JSON.stringify(clean, null, 2));
    return NextResponse.json({ ok: true, mapping: clean });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
