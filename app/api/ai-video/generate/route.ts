/**
 * Studio Vidéo IA — POST /api/ai-video/generate (Pascal 2026-06-10).
 * Body : { topic, imageUrls?: string[], ratio?: '9:16'|'1:1'|'16:9', voiceId?, musicId?, voiceover?: bool, segments?: number }
 * Pipeline : script DeepSeek → voix ElevenLabs (gated) → rendu ffmpeg.
 * Réponse : { ok, title, url, posterUrl, durationSec, voiceUsed, segments }.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { buildVideoPlan } from '@/lib/ai-video/plan';
import { resolveSegmentVisual } from '@/lib/ai-video/visual-router';
import { synthesizeVoice, isVoiceEnabled } from '@/lib/ai-video/elevenlabs';
import { synthesizeVoiceEdge, isEdgeAvailable, isEdgeVoiceId } from '@/lib/ai-video/tts-edge';
import { gpuTts, gpuWorkerAvailable } from '@/lib/ai-video/gpu-worker';
import { getAiKey } from '@/lib/ai-keys';
import { createDirectCard } from '@/lib/db';
import { renderAiVideo, type Ratio, type RenderSegment } from '@/lib/ai-video/render';
import { existsSync, readFileSync } from 'fs';
import { mkdir, writeFile } from 'fs/promises';
import { randomUUID } from 'crypto';
import path from 'path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const PUBLIC = '/home/ubuntu/talktome/public';
const DL_DIR = path.join(PUBLIC, 'uploads', 'aivid-src');

/** /uploads/x.jpg → chemin local ; http(s) → téléchargé en local ; sinon null. */
async function resolveImage(url: string): Promise<string | null> {
  if (!url) return null;
  try {
    if (url.startsWith('/uploads/') || url.startsWith('/audio-lib/')) {
      const p = path.join(PUBLIC, url.replace(/^\//, ''));
      return existsSync(p) ? p : null;
    }
    if (/^https?:\/\//.test(url)) {
      const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!res.ok) return null;
      const ct = res.headers.get('content-type') || '';
      if (!ct.startsWith('image/')) return null;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 256) return null;
      if (!existsSync(DL_DIR)) await mkdir(DL_DIR, { recursive: true });
      const ext = ct.includes('png') ? 'png' : ct.includes('webp') ? 'webp' : 'jpg';
      const out = path.join(DL_DIR, `${randomUUID()}.${ext}`);
      await writeFile(out, buf);
      return out;
    }
  } catch { /* ignore */ }
  return null;
}

function musicPathFromId(id?: string | null): string | null {
  if (!id) return null;
  try {
    const lib = JSON.parse(readFileSync(path.join(PUBLIC, 'audio-lib', 'index.json'), 'utf8')) as { id: string; file: string }[];
    const t = lib.find((x) => x.id === id);
    if (!t) return null;
    const p = path.join(PUBLIC, t.file.replace(/^\//, ''));
    return existsSync(p) ? p : null;
  } catch { return null; }
}

export async function POST(req: NextRequest) {
  const user = getCurrentUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let body: {
    topic?: string; imageUrls?: string[]; ratio?: string;
    voiceId?: string; musicId?: string; voiceover?: boolean; segments?: number;
    visualMode?: string; transition?: string;
  } = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'bad_body' }, { status: 400 }); }

  const request = (body.topic || '').trim();
  if (!request) return NextResponse.json({ error: 'topic_required' }, { status: 400 });

  // ===== A) PLAN structuré : demande libre → intention + format + scénario =====
  const plan = await buildVideoPlan(request, { segments: body.segments });
  // le body.ratio (si l'user a forcé un format) prime sur le format du plan
  const ratio = (['9:16', '1:1', '16:9'].includes(body.ratio || '') ? body.ratio : plan.format) as Ratio;
  const portrait = ratio === '9:16';

  // images attachées par l'user (réelles, prioritaires sur tout)
  const imgs: (string | null)[] = [];
  for (const u of (body.imageUrls || []).slice(0, 12)) imgs.push(await resolveImage(u));
  const usableImgs = imgs.filter(Boolean) as string[];

  // VOIX : NOTRE GPU (XTTS) en priorité, repli edge-tts/ElevenLabs.
  const userEleven = getAiKey(user.id, 'elevenlabs') || undefined;
  const hasEleven = !!userEleven || isVoiceEnabled();
  const useGpu = gpuWorkerAvailable();
  const wantVoice = body.voiceover !== false && (useGpu || isEdgeAvailable() || hasEleven);
  const useEleven = hasEleven && !!body.voiceId && !isEdgeVoiceId(body.voiceId);

  // ===== B) ROUTAGE : voix + visuel de chaque plan selon visual_strategy =====
  const segments: RenderSegment[] = await Promise.all(plan.segments.map(async (s, i): Promise<RenderSegment> => {
    const voiceP = (async (): Promise<string | null> => {
      if (!wantVoice) return null;
      let v = useGpu ? await gpuTts(s.narration, 'fr') : null;
      if (!v) v = useEleven ? await synthesizeVoice(s.narration, body.voiceId, userEleven) : await synthesizeVoiceEdge(s.narration, body.voiceId);
      if (!v && useEleven) v = await synthesizeVoiceEdge(s.narration);
      return v;
    })();
    const visP = resolveSegmentVisual(s, plan, { attachedImgs: usableImgs, index: i, portrait, topic: request });
    const [voicePath, vis] = await Promise.all([voiceP, visP]);
    return { caption: s.caption, videoPath: null, imagePath: vis.imagePath, voicePath };
  }));
  const voiceUsed = segments.some((s) => !!s.voicePath);

  const musicPath = musicPathFromId(body.musicId) || musicPathFromId('chill-1');

  // ===== rendu (montage) + D) PUBLICATION AUTO dans le feed =====
  try {
    if (req.signal.aborted) return NextResponse.json({ error: 'aborted' }, { status: 499 });
    const out = await renderAiVideo({ segments, ratio, musicPath, transition: body.transition, signal: req.signal });

    // D) le Composer PUBLIE lui-même (card vidéo dans le feed), sauf draft.
    let cardId: string | null = null;
    if (plan.publication_target !== 'draft') {
      try {
        const caption = [plan.title, plan.cta].filter(Boolean).join(' — ').slice(0, 200);
        const card = createDirectCard(user.id, { type: 'video', media_url: out.url, caption });
        cardId = card.id;
      } catch { /* la vidéo reste dispo même si la publication échoue */ }
    }

    return NextResponse.json({
      ok: true,
      title: plan.title,
      url: out.url,
      posterUrl: out.posterUrl,
      durationSec: out.durationSec,
      voiceUsed,
      voiceAvailable: isEdgeAvailable() || hasEleven,
      segments: plan.segments,
      plan: {
        intent: plan.intent, format: ratio, ton: plan.ton,
        presenter: plan.presenter, visual_strategy: plan.visual_strategy, cta: plan.cta,
      },
      published: !!cardId,
      cardId,
    });
  } catch (e) {
    return NextResponse.json({ error: 'render_failed', detail: (e as Error).message }, { status: 500 });
  }
}
