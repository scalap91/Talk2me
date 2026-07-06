/**
 * POST /api/formation/figures (Pascal 2026-07-04)
 * Extrait les FIGURES d'un PDF (unpdf.extractImages + sharp→PNG), filtrées (vraies figures,
 * pas les icônes), et renvoie leurs URLs. Le CLIENT (le téléphone) les OCR ensuite ON-DEVICE
 * (natif GPU ou web) → le texte des figures nourrit la formation. Le tel traite les images.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { getDocumentProxy, extractImages } from 'unpdf';
import sharp from 'sharp';
import { createOcrTask } from '@/lib/compute/task-queue';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const UPLOAD_DIR = path.join(process.cwd(), 'public/uploads');
const MAX_FIGURES = 24;   // borne le travail OCR côté tel
const MAX_PAGES = 80;     // borne l'extraction serveur

export async function POST(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let file: File | null = null;
  try {
    const form = await req.formData();
    const f = form.get('file') || form.get('pdf');
    if (f instanceof File) file = f;
  } catch { return NextResponse.json({ error: 'bad_form' }, { status: 400 }); }
  if (!file) return NextResponse.json({ error: 'no_file' }, { status: 400 });
  if (file.size > 25 * 1024 * 1024) return NextResponse.json({ error: 'too_big' }, { status: 400 });

  try {
    const buf = new Uint8Array(await file.arrayBuffer());
    const pdf = await getDocumentProxy(buf);
    const pages = Math.min(pdf.numPages || 1, MAX_PAGES);
    await mkdir(UPLOAD_DIR, { recursive: true });

    const figures: { url: string; page: number; w: number; h: number }[] = [];
    const seen = new Set<string>(); // dédup grossière (logos/bandeaux répétés = même taille)
    const stamp = Date.now();

    for (let p = 1; p <= pages && figures.length < MAX_FIGURES; p++) {
      let imgs: Array<{ data: Uint8Array | Buffer; width: number; height: number; channels: number }> = [];
      try { imgs = await extractImages(pdf, p) as unknown as typeof imgs; } catch { continue; }
      for (const im of imgs) {
        if (figures.length >= MAX_FIGURES) break;
        if (!im.width || !im.height || im.width < 200 || im.height < 140) continue; // pas une vraie figure
        const key = `${im.width}x${im.height}`;
        if (seen.has(key)) continue;
        seen.add(key);
        try {
          const png = await sharp(Buffer.from(im.data), { raw: { width: im.width, height: im.height, channels: im.channels as 1 | 2 | 3 | 4 } }).png().toBuffer();
          const name = `fig_${stamp}_${p}_${figures.length}.png`;
          await writeFile(path.join(UPLOAD_DIR, name), png);
          figures.push({ url: `/uploads/${name}`, page: p, w: im.width, h: im.height });
        } catch { /* image non encodable → on saute */ }
      }
    }

    // DISPATCH : chaque figure devient une TÂCHE prise par un téléphone du pool (son GPU l'OCR).
    const batch = `fig_${me.id}_${stamp}`;
    for (const f of figures) createOcrTask(batch, f.url);

    return NextResponse.json({ ok: true, batch, count: figures.length, figures, pages: pdf.numPages || 0 });
  } catch (e) {
    return NextResponse.json({ error: 'failed', message: e instanceof Error ? e.message : 'extraction figures' }, { status: 500 });
  }
}
