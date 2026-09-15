/**
 * lib/cards/project/domains/film-montage — MONTAGE (VS5), partie PURE.
 *
 * Le film se monte TOUT SEUL au fil des prises : pour chaque plan on garde la MEILLEURE prise
 * (score de cadrage/orientation, à défaut la plus récente), on construit une EDL (Edit Decision
 * List = suite ordonnée des prises retenues), et l'assemblage vidéo (ffmpeg, I/O) produit une
 * VERSION du film — régénérée à chaque nouvelle prise gardée (pré-montage consultable en continu).
 *
 * BOUSSOLE [[feedback_talk2me_democratiser_creation]] : montage AUTOMATIQUE depuis des prises
 * smartphone, pas une suite de montage à maîtriser. PUR : sélection + EDL déterministes (pas d'I/O,
 * pas de Date.now()). L'assemblage ffmpeg et l'écriture de la version vivent dans la route.
 */
import type { ProjectBlock } from '../../v2/types';
import type { StoryScene, StoryShot, StoryTake } from './film-storyboard';
import { scenesOf } from './film-storyboard';

function filmOf(project: ProjectBlock): Record<string, unknown> {
  return ((project.film as Record<string, unknown>) ?? {});
}
function takesOf(shot: StoryShot): StoryTake[] {
  const t = (shot as unknown as { takes?: StoryTake[] }).takes;
  return Array.isArray(t) ? t : [];
}
function selectedOf(shot: StoryShot): string | undefined {
  return (shot as unknown as { selectedTakeId?: string }).selectedTakeId;
}

/** Ordonne des prises : meilleur score d'abord, puis la plus récente. */
function byScoreThenRecent(a: StoryTake, b: StoryTake): number {
  const sa = a.orientationScore ?? -1, sb = b.orientationScore ?? -1;
  if (sb !== sa) return sb - sa;
  return (b.recorded_at ?? 0) - (a.recorded_at ?? 0);
}

/** Meilleure prise d'un plan : score d'orientation le plus haut, sinon la plus récente. undefined si aucune. */
export function bestTake(shot: StoryShot): StoryTake | undefined {
  const takes = takesOf(shot).filter((t) => t.status !== 'rejected' && t.media_url);
  if (!takes.length) return undefined;
  return [...takes].sort(byScoreThenRecent)[0];
}

/**
 * ANGLES d'un plan (multicam) = la MEILLEURE prise de CHAQUE caméra (`by_ref`). Une seule caméra
 * (ou prises sans `by_ref`) → un seul angle. Plusieurs caméras ayant filmé le plan → plusieurs angles,
 * que le montage fera ALTERNER (Pascal 2026-09-11 : « alterner les angles »). Ordre stable = par
 * horodatage croissant (le réalisateur, qui lance « Action », est généralement premier).
 */
export function shotAngles(shot: StoryShot): StoryTake[] {
  const takes = takesOf(shot).filter((t) => t.status !== 'rejected' && t.media_url);
  if (!takes.length) return [];
  const byCam = new Map<string, StoryTake[]>();
  for (const t of takes) {
    const cam = t.by_ref || '__solo__';
    const arr = byCam.get(cam);
    if (arr) arr.push(t); else byCam.set(cam, [t]);
  }
  return Array.from(byCam.values())
    .map((ts) => [...ts].sort(byScoreThenRecent)[0])
    .sort((a, b) => (a.recorded_at ?? 0) - (b.recorded_at ?? 0));
}

/**
 * Sélectionne la meilleure prise de CHAQUE plan (immutable) : pose `shot.selectedTakeId` + marque
 * la prise retenue `kept`. Renvoie le nouveau `film`. N'invente rien : un plan sans prise reste vide.
 */
export function selectBestTakes(project: ProjectBlock): Record<string, unknown> {
  const scenes = scenesOf(project);
  const next: StoryScene[] = scenes.map((sc) => ({
    ...sc,
    shots: (sc.shots ?? []).map((sh) => {
      const best = bestTake(sh);
      if (!best) return sh;
      const takes = takesOf(sh).map((t) => ({ ...t, status: t.id === best.id ? 'kept' : (t.status === 'kept' ? 'pending' : t.status) }));
      return { ...sh, takes, selectedTakeId: best.id } as StoryShot;
    }),
  }));
  return { ...filmOf(project), scenes: next };
}

/**
 * UNE bascule du cross-fader (montage multicam MANUEL, Pascal 2026-09-11) : « de `fromSec` à `toSec`,
 * montre la prise `takeId` ». La séquence des segments (ordonnés, contigus) = la décision de montage
 * faite à la main dans l'éditeur (2 vidéos calées + cross-fader à la DJ). Coupe FRANCHE (une image à la fois).
 */
export interface MulticamSegment { takeId: string; fromSec: number; toSec: number }
/** Liste de bascules enregistrée sur un plan par l'éditeur multicam. */
export interface MulticamEdit { segments: MulticamSegment[]; updated_at?: number }
function multicamEditOf(shot: StoryShot): MulticamEdit | undefined {
  const e = (shot as unknown as { multicamEdit?: MulticamEdit }).multicamEdit;
  return e && Array.isArray(e.segments) && e.segments.length ? e : undefined;
}

export interface EdlClip { media_url: string; fromSec: number; toSec: number }
/** Transition DEPUIS l'entrée précédente. 'cut' = coupe franche (défaut) ; 'fade' = fondu (xfade). */
export type EdlTransition = 'cut' | 'fade';
/** STUDIO (Couche 2) : carton de générique = un CLIP texte généré (titre de début / carton / crédits de fin). */
export interface TextCard { role?: 'title' | 'credits' | 'carton'; title: string; subtitle?: string; durationSec: number; bg?: string }
/** STUDIO (Couche 3) : redoublage d'un plan — remplacer ou superposer un audio sur CE plan. */
export interface ClipAudio { url: string; mode: 'replace' | 'mix'; volume: number }
/** STUDIO (Couche 3) : bande sonore sur TOUT le film (musique de fond bouclée + volumes). */
export interface Soundtrack { url: string; musicVolume: number; originalVolume: number }
export interface EdlEntry {
  sceneId: string; shotId: string; takeId: string; media_url: string;
  /** Montage multicam MANUEL : suite ordonnée de fenêtres (cross-fader) à assembler dans l'ordre.
   *  Absent = plan mono-prise, assemblé en un seul clip entier (comportement historique). */
  clips?: EdlClip[];
  /** STUDIO (Couche 1) : transition à la JOINTURE avec l'entrée précédente. Absent/‘cut’ = coupe franche
   *  (comportement historique du montage auto). Interne aux `clips` d'une même entrée = toujours cut. */
  transitionIn?: EdlTransition;
  /** STUDIO (Couche 2) : si présent, cette entrée est un CARTON de générique (pas de média) — le rendu
   *  génère un clip texte (fond + titre + sous-titre). `media_url`/`clips` sont alors vides. */
  card?: TextCard;
  /** STUDIO (Couche 3) : redoublage — audio à appliquer à CE plan (remplacer/superposer) avant assemblage. */
  audio?: ClipAudio;
}

/**
 * Construit l'EDL : la suite ORDONNÉE (scènes → plans) des prises retenues.
 * Si un plan porte un MONTAGE MULTICAM manuel (`multicamEdit.segments`), l'entrée porte `clips`
 * = les fenêtres décidées au cross-fader (résolues take→media_url), à assembler telles quelles.
 * Sinon : une seule prise (selectedTakeId), clip entier (inchangé).
 */
export function buildEDL(project: ProjectBlock): EdlEntry[] {
  const edl: EdlEntry[] = [];
  for (const sc of scenesOf(project)) {
    for (const sh of sc.shots ?? []) {
      const takes = takesOf(sh);
      const manual = multicamEditOf(sh);
      if (manual) {
        // Résout chaque bascule vers son media_url ; ignore une bascule vide/cassée.
        const clips: EdlClip[] = [];
        for (const s of manual.segments) {
          const t = takes.find((x) => x.id === s.takeId);
          if (!t?.media_url) continue;
          const from = Math.max(0, Number(s.fromSec) || 0);
          const to = Number(s.toSec) || 0;
          if (to - from < 0.05) continue;
          clips.push({ media_url: t.media_url, fromSec: from, toSec: to });
        }
        if (clips.length) {
          edl.push({ sceneId: sc.id, shotId: sh.id, takeId: clips[0] ? (takes.find((x) => x.media_url === clips[0].media_url)?.id ?? '') : '', media_url: clips[0].media_url, clips });
          continue;
        }
        // liste vide/cassée → on retombe sur la meilleure prise (jamais de plan vide).
      }
      const selId = selectedOf(sh);
      if (!selId) continue;
      const take = takes.find((t) => t.id === selId);
      if (!take?.media_url) continue;
      edl.push({ sceneId: sc.id, shotId: sh.id, takeId: take.id, media_url: take.media_url });
    }
  }
  return edl;
}

/**
 * Enregistre (immutable) la liste de bascules du cross-fader sur un plan : `shot.multicamEdit`.
 * Valide que chaque segment pointe une prise existante et que les fenêtres sont croissantes non vides.
 * Renvoie le nouveau `film` (la route persiste). Segments vides/invalides ignorés.
 */
export function applyMulticamEdit(
  project: ProjectBlock, sceneId: string, shotId: string, segments: MulticamSegment[], now: number,
): Record<string, unknown> {
  const film = filmOf(project);
  const scenes = Array.isArray(film.scenes) ? (film.scenes as StoryScene[]) : [];
  const next = scenes.map((sc) => {
    if (sc.id !== sceneId) return sc;
    return {
      ...sc,
      shots: (sc.shots ?? []).map((sh) => {
        if (sh.id !== shotId) return sh;
        const ids = new Set(takesOf(sh).map((t) => t.id));
        const clean = (Array.isArray(segments) ? segments : [])
          .map((s) => ({ takeId: String(s.takeId), fromSec: Math.max(0, Number(s.fromSec) || 0), toSec: Number(s.toSec) || 0 }))
          .filter((s) => ids.has(s.takeId) && s.toSec - s.fromSec >= 0.05)
          .sort((a, b) => a.fromSec - b.fromSec);
        const edit: MulticamEdit = { segments: clean, updated_at: now };
        return { ...sh, multicamEdit: edit } as StoryShot;
      }),
    };
  });
  return { ...film, scenes: next };
}

/** Couverture du montage : plans avec une prise retenue / total (pour la progression / l'UI). */
export function montageCoverage(project: ProjectBlock): { total: number; filled: number; ratio: number } {
  let total = 0, filled = 0;
  for (const sc of scenesOf(project)) for (const sh of sc.shots ?? []) { total++; if (selectedOf(sh)) filled++; }
  return { total, filled, ratio: total ? filled / total : 0 };
}

export interface FilmVersion { id: string; media_url: string; edl: EdlEntry[]; created_at: number; coverage: number }

/** Ajoute une VERSION assemblée (immutable). Id déterministe v1, v2… `now`/`media_url` INJECTÉS. */
export function applyVersion(project: ProjectBlock, mediaUrl: string, edl: EdlEntry[], now: number): { film: Record<string, unknown>; versionId: string } {
  const film = filmOf(project);
  const prev = Array.isArray(film.versions) ? (film.versions as FilmVersion[]) : [];
  const versionId = `v${prev.length + 1}`;
  const cov = montageCoverage(project).ratio;
  const version: FilmVersion = { id: versionId, media_url: mediaUrl, edl, created_at: now, coverage: cov };
  return { film: { ...film, versions: [...prev, version] }, versionId };
}

// ─────────────────────────── STUDIO — table de montage (Couche 1, Pascal 2026-09-12) ───────────────────────────
//
// Le montage auto reste une BOÎTE (buildEDL → ffmpeg). Le Studio la rend ÉDITABLE : l'utilisateur
// réordonne / rogne / supprime des plans et choisit la transition à chaque jointure. La décision est
// sauvée dans la .card (`film.studioEdit`) et le rendu final assemble CETTE timeline (pas l'EDL auto).
// PUR : dérivation + réconciliation + conversion déterministes ; le rendu ffmpeg vit dans la route.

/** Un item de la table de montage : un plan filmé (kind:'clip') OU un carton de générique (kind:'card'). */
export interface StudioItem {
  id: string;                    // id STABLE : plan = `${sceneId}__${shotId}` ; carton = `card_<uuid>` (créé par l'UI)
  kind: 'clip' | 'card';
  sceneId: string; shotId: string;
  clips: EdlClip[];              // (clip) fenêtres média — vide pour un carton
  transitionIn: EdlTransition;   // transition DEPUIS l'item précédent (le 1er item l'ignore)
  card?: TextCard;               // (card) contenu du carton de générique
  audio?: ClipAudio;             // (clip, Couche 3) redoublage : audio à appliquer à ce plan
}
export interface StudioEdit { items: StudioItem[]; updated_at: number; soundtrack?: Soundtrack }

function studioEditOf(project: ProjectBlock): StudioEdit | undefined {
  const e = (filmOf(project).studioEdit as StudioEdit | undefined);
  return e && Array.isArray(e.items) ? e : undefined;
}

/** Un EdlEntry (auto) → un StudioItem : id stable, clips résolus, transition cut par défaut.
 *  Une entrée mono-prise (sans clips) devient UNE fenêtre `toSec:0` = « prise entière » (non rognée). */
function entryToItem(e: EdlEntry): StudioItem {
  const clips: EdlClip[] = (e.clips && e.clips.length)
    ? e.clips.map((c) => ({ media_url: c.media_url, fromSec: c.fromSec, toSec: c.toSec }))
    : [{ media_url: e.media_url, fromSec: 0, toSec: 0 }];
  return { id: `${e.sceneId}__${e.shotId}`, kind: 'clip', sceneId: e.sceneId, shotId: e.shotId, clips, transitionIn: 'cut' };
}

/** Nettoie un redoublage de plan (Couche 3). null si pas d'URL. */
function cleanAudio(a: unknown): ClipAudio | undefined {
  const o = (a && typeof a === 'object' ? a : {}) as Record<string, unknown>;
  const url = String(o.url ?? '');
  if (!url) return undefined;
  return { url, mode: o.mode === 'mix' ? 'mix' : 'replace', volume: Math.max(0, Math.min(200, Number(o.volume) || 100)) };
}

/** Nettoie la bande sonore film (Couche 3). null si pas d'URL. */
function cleanSoundtrack(s: unknown): Soundtrack | undefined {
  const o = (s && typeof s === 'object' ? s : {}) as Record<string, unknown>;
  const url = String(o.url ?? '');
  if (!url) return undefined;
  return {
    url,
    musicVolume: Math.max(0, Math.min(200, Number(o.musicVolume) || 40)),
    originalVolume: Math.max(0, Math.min(200, Number(o.originalVolume) || 100)),
  };
}

/** Nettoie un carton (Couche 2) : borne titre/sous-titre/durée, valide le rôle et le fond. */
function cleanCard(c: unknown): TextCard {
  const o = (c && typeof c === 'object' ? c : {}) as Record<string, unknown>;
  const role = o.role === 'title' || o.role === 'credits' || o.role === 'carton' ? o.role : 'carton';
  const bg = typeof o.bg === 'string' && /^#?[0-9a-fA-F]{6}$/.test(o.bg) ? o.bg : undefined;
  return {
    role,
    title: String(o.title ?? '').slice(0, 120),
    ...(o.subtitle ? { subtitle: String(o.subtitle).slice(0, 200) } : {}),
    durationSec: Math.max(0.5, Math.min(30, Number(o.durationSec) || 3)),
    ...(bg ? { bg } : {}),
  };
}

/** Est-ce que l'utilisateur a rogné cet item (au moins une fenêtre a une fin réelle) ? */
function isTrimmed(it: StudioItem): boolean {
  return it.clips.some((c) => c.toSec > c.fromSec);
}

/**
 * Timeline du Studio : l'édition SAUVÉE si elle existe, RÉCONCILIÉE avec la réalité du tournage,
 * sinon dérivée de l'EDL auto (point de départ = le montage automatique).
 * Réconciliation (robuste aux re-tournages) :
 *   - garde l'ORDRE, les TRANSITIONS et les ROGNES choisis par l'utilisateur ;
 *   - un plan dont le média a disparu (prise supprimée) est RETIRÉ de la timeline ;
 *   - un plan NON rogné voit ses clips rafraîchis depuis l'EDL (nouvelle meilleure prise / nouveau multicam) ;
 *   - un plan filmé DEPUIS la dernière édition est AJOUTÉ à la fin (transition cut).
 */
export function buildStudioTimeline(project: ProjectBlock): StudioItem[] {
  const edl = buildEDL(project);
  const saved = studioEditOf(project);
  if (!saved) return edl.map(entryToItem);
  const current = new Map<string, StudioItem>();
  for (const e of edl) current.set(`${e.sceneId}__${e.shotId}`, entryToItem(e));
  const out: StudioItem[] = [];
  const seen = new Set<string>();
  for (const it of saved.items) {
    if (it.kind === 'card') {                        // CARTON de générique : créé par l'utilisateur, préservé tel quel
      out.push({ id: String(it.id), kind: 'card', sceneId: '', shotId: '', clips: [], transitionIn: it.transitionIn === 'fade' ? 'fade' : 'cut', card: cleanCard(it.card) });
      continue;
    }
    const cur = current.get(it.id);
    if (!cur) continue;                             // média disparu → retiré
    seen.add(it.id);
    const aud = cleanAudio(it.audio);
    out.push({ ...cur, transitionIn: it.transitionIn === 'fade' ? 'fade' : 'cut', clips: isTrimmed(it) ? it.clips : cur.clips, ...(aud ? { audio: aud } : {}) });
  }
  for (const e of edl) {                            // nouveaux plans filmés depuis → ajoutés à la fin
    const id = `${e.sceneId}__${e.shotId}`;
    if (!seen.has(id)) out.push(entryToItem(e));
  }
  return out;
}

/** Persiste (immutable, sanitize) la timeline éditée du Studio dans `film.studioEdit`. */
export function applyStudioEdit(project: ProjectBlock, items: StudioItem[], now: number, soundtrack?: unknown): Record<string, unknown> {
  const film = filmOf(project);
  const clean: StudioItem[] = (Array.isArray(items) ? items : []).map((it) => {
    const transitionIn = (it.transitionIn === 'fade' ? 'fade' : 'cut') as EdlTransition;
    if (it.kind === 'card') { // CARTON de générique (Couche 2) : pas de média, un contenu texte
      return { id: String(it.id || ''), kind: 'card' as const, sceneId: '', shotId: '', clips: [], transitionIn, card: cleanCard(it.card) };
    }
    const aud = cleanAudio(it.audio); // redoublage (Couche 3)
    return {
      id: String(it.id || ''), kind: 'clip' as const,
      sceneId: String(it.sceneId || ''), shotId: String(it.shotId || ''), transitionIn,
      clips: (Array.isArray(it.clips) ? it.clips : [])
        .map((c) => ({ media_url: String(c.media_url || ''), fromSec: Math.max(0, Number(c.fromSec) || 0), toSec: Math.max(0, Number(c.toSec) || 0) }))
        .filter((c) => c.media_url),
      ...(aud ? { audio: aud } : {}),
    };
  }).filter((it) => it.id && (it.kind === 'card' ? !!it.card && it.card.title.length > 0 : it.clips.length > 0));
  // Bande sonore (Couche 3) : soundtrack fourni → on l'enregistre ; explicitement null → on l'efface ; absent → inchangé.
  const st = soundtrack === undefined
    ? (film.studioEdit as StudioEdit | undefined)?.soundtrack
    : cleanSoundtrack(soundtrack);
  const edit: StudioEdit = { items: clean, updated_at: now, ...(st ? { soundtrack: st } : {}) };
  return { ...film, studioEdit: edit };
}

/** Bande sonore film enregistrée (Couche 3), ou undefined. */
export function studioSoundtrackOf(project: ProjectBlock): Soundtrack | undefined {
  return studioEditOf(project)?.soundtrack;
}

/** Convertit la timeline Studio en EDL rendable (ordre + transition + cartons), pour le rendu ffmpeg. */
export function studioToEDL(items: StudioItem[]): EdlEntry[] {
  const out: EdlEntry[] = [];
  for (const it of (Array.isArray(items) ? items : [])) {
    const transitionIn = it.transitionIn === 'fade' ? 'fade' as const : 'cut' as const;
    if (it.kind === 'card' && it.card) {            // CARTON : entrée sans média, le rendu génère le clip texte
      out.push({ sceneId: '', shotId: '', takeId: '', media_url: '', clips: [], transitionIn, card: cleanCard(it.card) });
      continue;
    }
    const media = it.clips[0]?.media_url || '';
    if (!media) continue;
    const aud = cleanAudio(it.audio); // redoublage (Couche 3)
    out.push({
      sceneId: it.sceneId, shotId: it.shotId, takeId: '', media_url: media,
      clips: it.clips.map((c) => ({ media_url: c.media_url, fromSec: c.fromSec, toSec: c.toSec })),
      transitionIn,
      ...(aud ? { audio: aud } : {}),
    });
  }
  return out;
}
