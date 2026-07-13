import 'server-only';
/**
 * lyrics-sync — CALAGE des paroles lrclib sur la VIDÉO via l'OCR (Pascal 2026-07-13).
 *
 * Idée (Pascal) : l'OCR lit la caption YouTube (timing PILE sur la vidéo) mais peut faire des
 * fautes de frappe. lrclib a le TEXTE propre mais un timing calé sur la version album (offset).
 * On COMPARE : chaque lecture OCR (texte sale, temps vidéo) est fuzzy-matchée à la bonne ligne
 * lrclib → on en déduit l'OFFSET (temps_vidéo − timestamp_lrclib). Médiane sur plusieurs lectures
 * = robuste. Résultat : texte propre (lrclib) + timing vidéo (OCR). Le texte OCR est jeté.
 */
import type { LrcLine } from './lyrics';

/** Normalise pour comparer : minuscules, sans accents/ponctuation, espaces compactés. */
export function norm(s: string): string {
  return (s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/['’`]/g, '')            // contractions : can't → cant (comme l'OCR les lit)
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * COUVERTURE : quelle fraction des MOTS d'une ligne de paroles est présente dans le bloc OCR ?
 * On normalise par la LIGNE (courte), pas par le bloc (long) — sinon un vrai match est dilué par
 * toute la nav/description autour de la caption. Une ligne ≥3 mots dont ≥70% des mots sont dans le
 * bloc = présente. (Ex. "together we cool me and her cant lose" dans "…video together we cool me
 * her cant lose titre officiel…" → 7/8 = présente.) Pascal 2026-07-13.
 */
export function coverage(lyric: string, blobWords: Set<string>): number {
  const lw = norm(lyric).split(' ').filter((w) => w.length >= 2);
  if (lw.length < 3) return 0; // trop court → pas fiable (mots communs)
  let hit = 0;
  for (const w of lw) if (blobWords.has(w)) hit++;
  return hit / lw.length;
}

/** Meilleure ligne lrclib présente dans le bloc OCR (nav/description ignorées automatiquement). */
export function bestMatch(cues: LrcLine[], ocrText: string): { index: number; score: number } {
  const words = new Set(norm(ocrText).split(' ').filter(Boolean));
  if (!words.size) return { index: -1, score: 0 };
  let best = -1, bestScore = 0;
  for (let i = 0; i < cues.length; i++) {
    const s = coverage(cues[i].text, words);
    if (s > bestScore) { bestScore = s; best = i; }
  }
  return { index: best, score: bestScore };
}

export interface OcrSample { text: string; time: number } // time = currentTime vidéo (s)

/**
 * COLLAGE lrclib ↔ vidéo (Pascal 2026-07-13) : on a le TEXTE propre+complet (lrclib) ET les temps
 * vidéo réels (fragments OCR). Pour chaque ligne lrclib, on trouve le fragment OCR qui la contient →
 * son temps vidéo = ANCRE. Puis on mappe TOUTES les lignes (même celles non scannées) par
 * interpolation linéaire par morceaux entre ancres (lrclib a déjà le bon rythme relatif). Résultat :
 * texte lrclib complet + timing vidéo. Renvoie [] si pas assez d'ancres (→ l'appelant tente l'IA).
 */
export function alignLyricsToVideo(lrclib: LrcLine[], frags: { text: string; t: number }[]): LrcLine[] {
  if (!lrclib?.length || !frags?.length) return [];
  const fragWords = frags
    .map((f) => ({ t: f.t, words: new Set(norm(f.text).split(' ').filter(Boolean)), used: false }))
    .sort((a, b) => a.t - b.t);
  // Ancres : (temps album lrclib → temps vidéo OCR), dans l'ordre des lignes.
  const anchors: { album: number; video: number }[] = [];
  for (const l of lrclib) {
    for (const f of fragWords) {
      if (!f.used && coverage(l.text, f.words) >= 0.7) { f.used = true; anchors.push({ album: l.t, video: f.t }); break; }
    }
  }
  // On garde les ancres MONOTONES (album↑ ⇒ vidéo↑) : une ancre incohérente = mauvais match, jetée.
  anchors.sort((a, b) => a.album - b.album);
  const mono: typeof anchors = [];
  for (const a of anchors) if (!mono.length || a.video > mono[mono.length - 1].video) mono.push(a);
  if (mono.length < 2) return []; // pas assez pour caler → IA en secours

  // Mappe un temps album → temps vidéo (interpolation linéaire par morceaux, extrapolation aux bords).
  const map = (album: number): number => {
    if (album <= mono[0].album) {
      const s = (mono[1].video - mono[0].video) / Math.max(0.001, mono[1].album - mono[0].album);
      return mono[0].video + (album - mono[0].album) * s;
    }
    for (let i = 0; i < mono.length - 1; i++) {
      if (album <= mono[i + 1].album) {
        const s = (mono[i + 1].video - mono[i].video) / Math.max(0.001, mono[i + 1].album - mono[i].album);
        return mono[i].video + (album - mono[i].album) * s;
      }
    }
    const n = mono.length - 1;
    const s = (mono[n].video - mono[n - 1].video) / Math.max(0.001, mono[n].album - mono[n - 1].album);
    return mono[n].video + (album - mono[n].album) * s;
  };
  return lrclib.map((l) => ({ t: Math.max(0, Math.round(map(l.t) * 100) / 100), text: l.text }));
}

/**
 * Calcule l'OFFSET (s) entre lrclib et la vidéo à partir des lectures OCR.
 * offset > 0 = la vidéo est EN AVANCE sur lrclib (intro) → il faut décaler lrclib de +offset.
 * On ne garde que les matches SÛRS (score ≥ minScore), puis MÉDIANE des deltas (robuste aux outliers).
 */
export function computeOffset(
  cues: LrcLine[],
  samples: OcrSample[],
  minScore = 0.55,
): { offset: number | null; matches: number; deltas: number[] } {
  const deltas: number[] = [];
  for (const s of samples) {
    if (!s || typeof s.time !== 'number' || !s.text) continue;
    const m = bestMatch(cues, s.text);
    if (m.index >= 0 && m.score >= minScore) {
      deltas.push(s.time - cues[m.index].t);
    }
  }
  if (deltas.length < 2) return { offset: null, matches: deltas.length, deltas };
  const sorted = [...deltas].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  return { offset: Math.round(median * 1000) / 1000, matches: deltas.length, deltas };
}
