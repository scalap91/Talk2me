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
import { selectBestTakes, buildEDL, applyVersion, montageCoverage, buildStudioTimeline, studioToEDL, studioSoundtrackOf, type EdlEntry } from '@/lib/cards/project/domains/film-montage';
import { concatClips, probeOrientation, makeTextCardClip, applyClipAudio, mixSoundtrack, type ConcatClipInput, type ConcatTransitionInput } from '@/lib/ffmpeg-helpers';
import { projectOrientationMode } from '@/lib/cards/project/orientation';

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

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const fromStudio = body.studio === true; // STUDIO (Couche 1) : rend la timeline ÉDITÉE, pas l'EDL auto.

  // 1) EDL à rendre. AUTO = meilleure prise de chaque plan. STUDIO = timeline éditée (ordre/rognes/transitions).
  let edl: EdlEntry[];
  if (fromStudio) {
    edl = studioToEDL(buildStudioTimeline(project));
  } else {
    project.film = selectBestTakes(project);
    edl = buildEDL(project);
  }
  if (edl.length === 0) return NextResponse.json({ error: 'no_takes', hint: 'filme au moins un plan d\'abord' }, { status: 409 });

  const pub = path.join(process.cwd(), 'public');
  const workDir = path.join(process.cwd(), 'data', 'tmp-montage');
  if (!existsSync(workDir)) await mkdir(workDir, { recursive: true });

  // ORIENTATION DU FILM (Pascal 2026-09-09) : le canvas suit le mode dominant. On SONDE la 1re VRAIE
  // prise (ffprobe, rotation incluse) — on saute les cartons de générique (sans média). Fallback = tag
  // projet, puis portrait. Un film paysage ne doit JAMAIS finir en cadre portrait (bug Pascal 2026-09-10).
  const firstMedia = edl.find((e) => !e.card && (e.media_url || (e.clips && e.clips.length)));
  const firstMediaRel = firstMedia?.clips?.[0]?.media_url || firstMedia?.media_url || '';
  const probed = firstMediaRel ? await probeOrientation(path.join(pub, firstMediaRel)) : null;
  const mode = probed ?? projectOrientationMode(project) ?? 'portrait';
  // Définition UNIFORME 1080p (HD). cover:true → chaque prise REMPLIT le cadre (crop) au lieu de bandes noires.
  const canvas = mode === 'landscape' ? { width: 1920, height: 1080, cover: true } : { width: 1080, height: 1920, cover: true };

  // 2) Assemble via ffmpeg. Chaque clip = un segment normalisé h264/aac.
  // MULTICAM MANUEL (Pascal 2026-09-11) : un plan monté au cross-fader porte `entry.clips` = la suite de
  // bascules (fenêtre [fromSec,toSec]) ; on les assemble dans l'ordre. Sinon = une prise, clip entier.
  // CARTON DE GÉNÉRIQUE (Studio Couche 2) : une entrée `card` n'a pas de média → on GÉNÈRE un clip texte
  // (fond + titre + sous-titre) au canvas du film, inséré comme n'importe quel clip.
  // TRANSITIONS (Studio, Couche 1) : à la JOINTURE entre DEUX entrées on applique `entry.transitionIn`
  // (cut/fondu) ; à l'INTÉRIEUR d'un plan multicam, toujours cut. Le montage auto n'a pas de transitionIn.
  const clips: ConcatClipInput[] = [];
  const transitions: ConcatTransitionInput[] = [];
  const pushJoin = (entryBoundary: boolean, e: EdlEntry) => {
    if (clips.length === 0) return;
    const fade = entryBoundary && e.transitionIn === 'fade';
    transitions.push(fade ? { type: 'fade', durationMs: 400 } : { type: 'cut', durationMs: 0 });
  };
  for (const e of edl) {
    if (e.card) { // CARTON : génère un clip texte à part
      const cardPath = path.join(workDir, `.card_${randomUUID()}.mp4`);
      try {
        await makeTextCardClip({ title: e.card.title, subtitle: e.card.subtitle, durationSec: e.card.durationSec, bg: e.card.bg, canvas: { width: canvas.width, height: canvas.height }, outPath: cardPath });
      } catch (err) {
        return NextResponse.json({ error: 'card_render_failed', detail: err instanceof Error ? err.message.slice(0, 200) : String(err) }, { status: 500 });
      }
      pushJoin(true, e);
      clips.push({ sourcePath: cardPath, trimStartSec: 0, trimEndSec: Math.max(0.5, e.card.durationSec) });
      continue;
    }
    const entryClips = (e.clips && e.clips.length)
      ? e.clips.map((c) => ({ path: path.join(pub, c.media_url), rel: c.media_url, trimStartSec: Math.max(0, c.fromSec), trimEndSec: c.toSec > c.fromSec ? c.toSec : 3600 }))
      : [{ path: path.join(pub, e.media_url), rel: e.media_url, trimStartSec: 0, trimEndSec: 3600 }];
    // REDOUBLAGE (Studio Couche 3) : sur un plan mono-prise, on remplace/superpose l'audio AVANT assemblage.
    if (e.audio?.url && entryClips.length === 1) {
      const audioAbs = path.join(pub, e.audio.url);
      if (!existsSync(audioAbs)) return NextResponse.json({ error: 'audio_missing', path: e.audio.url }, { status: 409 });
      if (!existsSync(entryClips[0].path)) return NextResponse.json({ error: 'take_media_missing', path: entryClips[0].rel }, { status: 409 });
      const dubbed = path.join(workDir, `.dub_${randomUUID()}.mp4`);
      try {
        await applyClipAudio(entryClips[0].path, audioAbs, e.audio.mode === 'mix' ? 'mix' : 'replace', e.audio.volume, dubbed);
        entryClips[0].path = dubbed; // le clip redoublé remplace la source (le trim s'applique dessus)
      } catch (err) {
        return NextResponse.json({ error: 'dub_failed', detail: err instanceof Error ? err.message.slice(0, 200) : String(err) }, { status: 500 });
      }
    }
    for (let ci = 0; ci < entryClips.length; ci++) {
      const c = entryClips[ci];
      if (!existsSync(c.path)) return NextResponse.json({ error: 'take_media_missing', path: c.rel }, { status: 409 });
      pushJoin(ci === 0, e); // entre entrées (ci===0) → transition de l'entrée ; à l'intérieur d'un plan → cut
      clips.push({ sourcePath: c.path, trimStartSec: c.trimStartSec, trimEndSec: Math.max(c.trimStartSec + 0.1, c.trimEndSec) });
    }
  }
  let fname = `cut_${randomUUID()}.mp4`;
  const outPath = path.join(pub, 'uploads', fname);
  try {
    await concatClips(clips, transitions, outPath, workDir, canvas);
  } catch (e) {
    return NextResponse.json({ error: 'assembly_failed', detail: e instanceof Error ? e.message.slice(0, 300) : String(e) }, { status: 500 });
  }

  // BANDE SONORE (Studio Couche 3) : musique de fond bouclée + calée sur tout le film, mixée avec le son.
  const soundtrack = fromStudio ? studioSoundtrackOf(project) : undefined;
  if (soundtrack?.url) {
    const musicAbs = path.join(pub, soundtrack.url);
    if (existsSync(musicAbs)) {
      const withMusic = `cut_${randomUUID()}.mp4`;
      try {
        await mixSoundtrack(outPath, musicAbs, soundtrack.musicVolume, soundtrack.originalVolume, path.join(pub, 'uploads', withMusic));
        fname = withMusic; // la version finale = film + musique
      } catch (err) {
        return NextResponse.json({ error: 'soundtrack_failed', detail: err instanceof Error ? err.message.slice(0, 200) : String(err) }, { status: 500 });
      }
    }
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
