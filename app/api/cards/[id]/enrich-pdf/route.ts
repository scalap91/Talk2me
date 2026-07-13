/**
 * Talk2Me — ENRICHIR une card via PDF SCANNÉ (page-entité vivante, Pascal 2026-07-08).
 * POST /api/cards/{id}/enrich-pdf  (auth OBLIGATOIRE, multipart form-data, champ `file`)
 *
 * Pipeline :
 *   A. texte natif — unpdf `extractText`. PDF texte (> 200 car. non-blancs) → on l'utilise.
 *   B. OCR (PDF scanné) — rastérise chaque page (unpdf `renderPageAsImage` + node-canvas),
 *      OCR via tesseract.js (`fra+eng`). Max ~8 pages. Rasterisation impossible → dégradation
 *      propre { ok:false, reason:'rasterisation_indisponible' } (jamais de 500).
 *   C. reconstruction Léa — le MÊME client LLM que enrich/route.ts (DeepSeek) répare l'OCR
 *      en se fondant UNIQUEMENT sur le contexte INTERNE du document ([[feedback_content_grounding]]).
 *
 * Le résultat est un BROUILLON : l'humain relit et valide avant publication.
 * Le PDF n'est JAMAIS stocké (traitement 100 % en mémoire), son contenu n'est PAS loggué.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import path from 'path';
import OpenAI from 'openai';
import { getCurrentUserFromRequest } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// OCR de plusieurs pages scannées = lent (rasterisation + tesseract wasm).
export const maxDuration = 300;

const MAX_BYTES = 12 * 1024 * 1024; // 12 Mo
const MAX_OCR_PAGES = 8;
const NATIVE_TEXT_MIN = 200; // seuil « c'est un vrai PDF texte »

// traineddata : téléchargées au 1er run depuis le CDN standard puis cachées dans
// .tesseract-cache/ (gitignored). Runs suivants = offline, aucun re-download.
const TESS_LANG_PATH = 'https://tessdata.projectnaptha.com/4.0.0';
const TESS_CACHE_PATH = path.join(process.cwd(), '.tesseract-cache');

const RECONSTRUCT_PROMPT =
  "Ce texte provient d'un document SCANNÉ peu lisible passé à l'OCR. Reconstitue " +
  "fidèlement le contenu RÉEL du document : corrige les fautes d'OCR, rétablis les " +
  "mots et passages manquants en te fondant UNIQUEMENT sur le contexte interne du " +
  "document (jamais d'information extérieure inventée). Si un passage reste trop " +
  "illisible pour être deviné, écris [illisible] à la place. Rends un texte clair et " +
  "bien structuré. Réponds uniquement par le texte reconstitué.";

/** Léa reconstitue le document (DeepSeek), dans la langue finale. Pas de clé / échec → texte brut. */
async function reconstruct(raw: string, lang: string): Promise<string> {
  const original = (raw || '').trim();
  if (!original) return '';
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) return original;
  try {
    const client = new OpenAI({
      apiKey,
      baseURL: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
      timeout: 60000,
      maxRetries: 1,
    });
    const res = await client.chat.completions.create({
      model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
      temperature: 0.2,
      max_tokens: 2000,
      messages: [
        { role: 'system', content: `${RECONSTRUCT_PROMPT} Rédige le texte reconstitué en ${lang} (traduis si le document est dans une autre langue). Structure avec des sous-titres courts sur leur propre ligne. N'utilise AUCUN symbole markdown (ni **, ni #, ni *).` },
        { role: 'user', content: original.slice(0, 20000) },
      ],
    });
    const out = (res.choices?.[0]?.message?.content || '').trim();
    return out || original;
  } catch {
    return original;
  }
}

/** Étape A — texte natif via unpdf. Renvoie { text, pages }. */
async function nativeText(data: Uint8Array): Promise<{ text: string; pages: number }> {
  try {
    const { extractText } = await import('unpdf');
    const { totalPages, text } = await extractText(data, { mergePages: true });
    return { text: (text || '').trim(), pages: totalPages || 0 };
  } catch {
    return { text: '', pages: 0 };
  }
}

/**
 * Étape B — OCR d'un PDF scanné. Rasterise (node-canvas) + tesseract.js.
 * Renvoie null si la rasterisation est vraiment impossible dans cet env.
 */
async function ocrPdf(
  data: Uint8Array,
  totalPages: number,
): Promise<{ text: string; pages: number; truncated: boolean } | null> {
  let renderPageAsImage: typeof import('unpdf').renderPageAsImage;
  try {
    ({ renderPageAsImage } = await import('unpdf'));
  } catch {
    return null;
  }

  const pageCount = totalPages > 0 ? totalPages : 1;
  const limit = Math.min(pageCount, MAX_OCR_PAGES);
  const truncated = pageCount > MAX_OCR_PAGES;

  // Rasterise les pages en PNG (scale 2 pour un OCR net). node-canvas fournit createCanvas.
  const images: Buffer[] = [];
  for (let p = 1; p <= limit; p++) {
    try {
      const ab = await renderPageAsImage(data.slice(), p, {
        canvasImport: () => import('canvas') as unknown as Promise<never>,
        scale: 2,
      });
      images.push(Buffer.from(ab));
    } catch (e) {
      // 1re page qui échoue = rasterisation indisponible → dégradation propre.
      if (p === 1) {
        console.warn('[enrich-pdf] rasterisation indisponible:', (e as Error)?.message);
        return null;
      }
      // page ultérieure : on log et on continue avec ce qu'on a.
      console.warn(`[enrich-pdf] page ${p} non rasterisée:`, (e as Error)?.message);
      break;
    }
  }
  if (images.length === 0) return null;

  // OCR fra+eng. Un seul worker réutilisé pour toutes les pages.
  let worker: Awaited<ReturnType<typeof import('tesseract.js').createWorker>> | null = null;
  const parts: string[] = [];
  try {
    const { createWorker } = await import('tesseract.js');
    worker = await createWorker('fra+eng', 1, {
      langPath: TESS_LANG_PATH,
      cachePath: TESS_CACHE_PATH,
      gzip: true,
    });
    for (const img of images) {
      try {
        const { data: r } = await worker.recognize(img);
        const t = (r?.text || '').trim();
        if (t) parts.push(t);
      } catch (e) {
        console.warn('[enrich-pdf] OCR page échouée:', (e as Error)?.message);
      }
    }
  } catch (e) {
    console.warn('[enrich-pdf] OCR indisponible:', (e as Error)?.message);
    return null;
  } finally {
    try {
      await worker?.terminate();
    } catch {
      /* ignore */
    }
  }

  return { text: parts.join('\n\n').trim(), pages: images.length, truncated };
}

export async function POST(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  // 1) Récupère le fichier (multipart)
  let file: File | null = null;
  let lang = 'français';
  try {
    const form = await req.formData();
    const f = form.get('file');
    if (f && typeof f !== 'string') file = f as File;
    const l = form.get('lang');
    if (typeof l === 'string' && l.trim()) lang = l.trim().slice(0, 30);
  } catch {
    return NextResponse.json({ ok: false, reason: 'bad_form' }, { status: 400 });
  }
  if (!file) return NextResponse.json({ ok: false, reason: 'no_file' }, { status: 400 });
  if (file.type && file.type !== 'application/pdf') {
    return NextResponse.json({ ok: false, reason: 'not_pdf' }, { status: 415 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ ok: false, reason: 'too_large' }, { status: 413 });
  }

  const data = new Uint8Array(await file.arrayBuffer());
  // garde-fou : signature %PDF (pas de log du contenu)
  if (!(data[0] === 0x25 && data[1] === 0x50 && data[2] === 0x44 && data[3] === 0x46)) {
    return NextResponse.json({ ok: false, reason: 'not_pdf' }, { status: 415 });
  }

  try {
    // Étape A — texte natif
    const nat = await nativeText(data.slice());
    const natNonBlank = nat.text.replace(/\s/g, '').length;
    if (natNonBlank > NATIVE_TEXT_MIN) {
      const text = await reconstruct(nat.text, lang);
      return NextResponse.json({
        ok: true,
        text,
        source: 'pdf-text',
        pages: nat.pages,
        truncated: false,
      });
    }

    // Étape B — OCR (PDF scanné)
    const ocr = await ocrPdf(data.slice(), nat.pages);
    if (ocr === null) {
      return NextResponse.json({ ok: false, reason: 'rasterisation_indisponible' }, { status: 200 });
    }
    if (!ocr.text) {
      return NextResponse.json({ ok: false, reason: 'ocr_vide' }, { status: 200 });
    }

    // Étape C — reconstruction Léa
    const text = await reconstruct(ocr.text, lang);
    return NextResponse.json({
      ok: true,
      text,
      source: 'ocr',
      pages: ocr.pages,
      truncated: ocr.truncated,
    });
  } catch (e) {
    // Jamais de 500 non géré.
    console.warn('[enrich-pdf] échec traitement:', (e as Error)?.message);
    return NextResponse.json({ ok: false, reason: 'traitement_impossible' }, { status: 200 });
  }
}
