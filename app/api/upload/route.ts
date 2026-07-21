// /home/ubuntu/talktome/app/api/upload/route.ts
import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import sharp from 'sharp';
import { ensureNativePlayable } from '@/lib/ffmpeg-helpers';
import { createOcrTask, getTask } from '@/lib/compute/task-queue';
import { hasContactLeak } from '@/lib/cards/contact-guard';

/**
 * Anti-désintermédiation — COUCHE 2 (image) : OCR via le COMPUTE MESH (le pool de téléphones
 * connectés — [[project_talk2me_compute_mesh]]), PAS un GPU serveur. On crée une tâche OCR ; un tél
 * du pool la prend, OCR sur SON GPU, renvoie le texte ; on détecte un numéro. FIRE-AND-FORGET : ne
 * bloque JAMAIS l'upload. Si le pool est vide/lent → on abandonne (best-effort). Couche dissuasive.
 * Signale `[card-guard] NUMÉRO sur IMAGE`. Cf. [[project_talk2me_anti_desinter_scan]].
 */
function flagImageContactLeak(url: string): void {
  void (async () => {
    try {
      const task = createOcrTask('contact-scan', url); // le POOL prend la tâche, OCR sur son GPU
      const deadline = Date.now() + 40_000;
      for (;;) {
        await new Promise((r) => setTimeout(r, 2500));
        const t = getTask(task.id);
        if (t && t.status === 'done') {
          if (hasContactLeak(t.result)) {
            console.warn(`[card-guard] NUMÉRO sur IMAGE (mesh OCR ${t.via ?? '?'}) url=${url} — ${t.result.slice(0, 60)}`);
          }
          return;
        }
        if (Date.now() > deadline) return; // pool vide/lent → best-effort, on lâche
      }
    } catch { /* best-effort */ }
  })();
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UPLOAD_DIR = path.join(process.cwd(), 'public/uploads');
const PUBLIC_PREFIX = '/uploads';

// Talk2Me média (Pascal 2026-06-04) — limites par kind.
// Master direct (mission media chat) : image 10 Mo / audio 20 Mo / vidéo 50 Mo.
const MAX_IMAGE = 10 * 1024 * 1024;
const MAX_AUDIO = 20 * 1024 * 1024;
// Talk2Me #422 (Pascal 2026-06-06) — 50 Mo bloquait quasi toutes les vidéos de
// téléphone (file_too_large → la vidéo n'apparaissait pas dans l'éditeur).
// Relevé à 200 Mo puis 500 Mo. 2026-06-10 (Pascal « passe par l'apk ») : monté à
// 2 Go pour permettre l'envoi d'un screen recording lourd via l'APK natif.
// Aligné avec nginx talk2me.fr (client_max_body_size 2G).
const MAX_VIDEO = 2 * 1024 * 1024 * 1024;

const ALLOWED_VIDEO = new Set([
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/x-m4v',
]);
const ALLOWED_IMAGE = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
]);
const ALLOWED_AUDIO = new Set([
  'audio/mpeg',
  'audio/mp3',
  'audio/mp4',
  'audio/m4a',
  'audio/x-m4a',
  'audio/aac',
  'audio/ogg',
  'audio/webm',
  'audio/wav',
  'audio/x-wav',
]);

const MIME_TO_EXT: Record<string, string> = {
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
  'video/x-m4v': 'm4v',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'model/gltf-binary': 'glb',
  'model/gltf+json': 'gltf',
  'model/vnd.usdz+zip': 'usdz',
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/mp4': 'm4a',
  'audio/m4a': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/aac': 'aac',
  'audio/ogg': 'ogg',
  'audio/webm': 'weba',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
};

function safeExtFromName(name: string | undefined | null): string | null {
  if (!name) return null;
  const m = name.match(/\.([a-zA-Z0-9]{1,6})$/);
  return m ? m[1].toLowerCase() : null;
}

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get('file');
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: 'no_file' }, { status: 400 });
    }

    const mime = (file.type || '').toLowerCase();
    const size = file.size;

    // Détection par préfixe : on accepte TOUT format vidéo/image/audio (pas
    // seulement une liste figée — sinon mkv, avi, 3gp, mpeg… étaient refusés en
    // silence). L'extension tombe sur le mapping connu, sinon le nom de fichier.
    const lowName = (file.name || '').toLowerCase();
    let kind: 'video' | 'image' | 'audio' | 'model' | null = null;
    if (ALLOWED_VIDEO.has(mime) || mime.startsWith('video/')) kind = 'video';
    else if (ALLOWED_IMAGE.has(mime) || mime.startsWith('image/')) kind = 'image';
    else if (ALLOWED_AUDIO.has(mime) || mime.startsWith('audio/')) kind = 'audio';
    // modèles 3D AR (Léa) : glb (Android/model-viewer) + usdz (iPhone/Quick Look)
    else if (mime.startsWith('model/') || /\.(glb|gltf|usdz)$/.test(lowName)) kind = 'model';

    if (!kind) {
      return NextResponse.json(
        { error: 'unsupported_mime', mime },
        { status: 415 }
      );
    }

    const max =
      kind === 'video' || kind === 'model' ? MAX_VIDEO : kind === 'audio' ? MAX_AUDIO : MAX_IMAGE;
    if (size > max) {
      return NextResponse.json(
        {
          error: 'file_too_large',
          size,
          max,
          max_mb: max / 1024 / 1024,
          kind,
        },
        { status: 413 }
      );
    }

    const ext = MIME_TO_EXT[mime] ?? safeExtFromName(file.name) ?? 'bin';
    const id = randomUUID();

    if (!existsSync(UPLOAD_DIR)) {
      await mkdir(UPLOAD_DIR, { recursive: true });
    }

    const buf = Buffer.from(await file.arrayBuffer());

    // Compression image (Pascal 2026-06-14, réseau lent Afrique) : resize ≤1600px +
    // WebP qualité 78 + orientation EXIF appliquée. Règle aussi le HEIC iPhone
    // (non affichable) en le convertissant. GIF laissé tel quel (animation).
    let outBuf = buf;
    let outExt = ext;
    const isGif = mime === 'image/gif' || lowName.endsWith('.gif');
    if (kind === 'image' && !isGif) {
      try {
        outBuf = await sharp(buf, { failOn: 'none' })
          .rotate()
          .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
          .webp({ quality: 78 })
          .toBuffer();
        outExt = 'webp';
      } catch (e) {
        console.warn('[upload] compression image échouée, original conservé', e);
        outBuf = buf; outExt = ext;
      }
    }

    const filename = `${id}.${outExt}`;
    const fullPath = path.join(UPLOAD_DIR, filename);
    await writeFile(fullPath, outBuf);

    // Lisibilité NATIVE (Pascal 2026-07-21) : le composer web produit souvent de
    // l'audio OPUS dans un MP4 → Chrome le lit mais Android/iOS natifs échouent
    // (« Vidéo illisible »). On normalise l'audio en AAC (vidéo h264 copiée, sans
    // perte) au point de passage unique. Best-effort : si ffmpeg échoue, on garde
    // l'original (le web reste lisible). Seuls les conteneurs ISOBMFF (mp4/mov/m4v).
    if (kind === 'video' && (outExt === 'mp4' || outExt === 'mov' || outExt === 'm4v')) {
      try {
        const r = await ensureNativePlayable(fullPath);
        if (r.converted) console.log(`[upload] vidéo normalisée native (${r.from} → h264/aac): ${filename}`);
      } catch (e) {
        console.warn('[upload] normalisation native échouée, original conservé', e);
      }
    }

    const url = `${PUBLIC_PREFIX}/${filename}`;
    // Anti-désintermédiation couche 2 : scan OCR de l'image par le pool (non-bloquant, best-effort).
    if (kind === 'image') flagImageContactLeak(url);
    return NextResponse.json({
      url,
      size: outBuf.length,
      original_size: size,
      mime: outExt === 'webp' ? 'image/webp' : mime,
      kind,
      original_filename: typeof file.name === 'string' ? file.name : null,
    });
  } catch (err) {
    console.error('[upload] POST error:', err);
    return NextResponse.json({ error: 'upload_failed' }, { status: 500 });
  }
}
