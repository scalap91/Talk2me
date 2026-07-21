import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { randomUUID } from 'crypto';
import { existsSync } from 'fs';
import { mkdir } from 'fs/promises';
import path from 'path';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { loadProject, saveCard } from '@/lib/cards/project/store';
import { renderCard } from '@/lib/cards/v2/reader/reader';
import { canStoryboard } from '@/lib/cards/project/domains/film-creative';
import { selectBestTakes, buildEDL, applyVersion, montageCoverage, type EdlEntry } from '@/lib/cards/project/domains/film-montage';
import { concatClips, type ConcatClipInput, type ConcatTransitionInput } from '@/lib/ffmpeg-helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };
const flagOff = () => process.env.SUPERCARD_PROJECT_V1 !== '1';

/**
 * POST /api/project/:id/montage — MONTE le film (VS5). Garde la meilleure prise de chaque plan,
 * construit l'EDL, ASSEMBLE (ffmpeg concatClips → h264/aac) une VERSION du film, régénérée à chaque
 * appel. Le montage GRANDIT au fil des prises. Owner-only ; gate storyboard.
 */
export async function POST(req: NextRequest, ctx: Ctx) {
  if (flagOff()) return NextResponse.json({ error: 'disabled' }, { status: 404 });
  const user = getCurrentUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await ctx.params;
  const card = await loadProject(id);
  if (!card) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (card.owner !== user.id) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const project = card.project!;
  if (project.domain !== 'film') return NextResponse.json({ error: 'domain_not_supported' }, { status: 400 });
  if (!canStoryboard(project)) return NextResponse.json({ error: 'gate_closed', need: 'storyboard validé' }, { status: 409 });

  // 1) Sélectionne la meilleure prise de chaque plan + EDL.
  project.film = selectBestTakes(project);
  const edl: EdlEntry[] = buildEDL(project);
  if (edl.length === 0) return NextResponse.json({ error: 'no_takes', hint: 'filme au moins un plan d\'abord' }, { status: 409 });

  // 2) Assemble via ffmpeg (chaque prise = un clip normalisé h264/aac, concaténés en cut).
  const pub = path.join(process.cwd(), 'public');
  const clips: ConcatClipInput[] = edl.map((e) => ({ sourcePath: path.join(pub, e.media_url), trimStartSec: 0, trimEndSec: 3600 }));
  for (const c of clips) if (!existsSync(c.sourcePath)) return NextResponse.json({ error: 'take_media_missing', path: c.sourcePath.split('/public/')[1] }, { status: 409 });
  const transitions: ConcatTransitionInput[] = edl.slice(1).map(() => ({ type: 'cut', durationMs: 0 }));

  const workDir = path.join(process.cwd(), 'data', 'tmp-montage');
  if (!existsSync(workDir)) await mkdir(workDir, { recursive: true });
  const fname = `cut_${randomUUID()}.mp4`;
  const outPath = path.join(pub, 'uploads', fname);
  try {
    await concatClips(clips, transitions, outPath, workDir);
  } catch (e) {
    return NextResponse.json({ error: 'assembly_failed', detail: e instanceof Error ? e.message.slice(0, 300) : String(e) }, { status: 500 });
  }

  // 3) Enregistre la version dans le .card.
  const url = `/uploads/${fname}`;
  const { film, versionId } = applyVersion(project, url, edl, Date.now());
  project.film = film;
  const saved = await saveCard(card);
  if (!saved.ok) return NextResponse.json({ error: 'invalid_card', issues: saved.errors }, { status: 400 });

  return NextResponse.json({
    id: card.id, version_id: versionId, media_url: url,
    shots: edl.length, coverage: Math.round(montageCoverage(project).ratio * 100),
    view: renderCard(card, 'full'),
  });
}
