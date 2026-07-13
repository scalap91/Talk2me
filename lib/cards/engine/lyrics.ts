/**
 * Talk2Me — PAROLES SYNCHRONISÉES (karaoké) d'une entité son (Pascal 2026-07-11).
 *
 * Best-effort « on affiche quand y'a, sinon rien ». Source = lrclib.net (LRC synchro, gratuit, sans
 * token) cherché par TITRE du son, rangé PAR ENTITÉ (clé yt:<id>) comme l'article ([[article]]).
 * NB : les captions YouTube sont FERMÉES côté serveur (prouvé : HTML dépouillé + InnerTube tokené) →
 * lrclib est la seule source synchro fiable (mainstream ; le local n'aura pas de karaoké, assumé).
 */
import { getDb } from '@/lib/db';
import { ytIdFromAudio } from '@/lib/cards/entity-key';

export type LrcLine = { t: number; text: string };

let ready = false;
function ensure(): void {
  if (ready) return;
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS entity_lyrics (
      entity_ref  TEXT PRIMARY KEY,
      synced_json TEXT NOT NULL DEFAULT '[]',
      source      TEXT NOT NULL DEFAULT '',
      created_at  INTEGER NOT NULL
    );
  `);
  // offset_ms = calage OCR→vidéo (Pascal 2026-07-13) : texte lrclib + timing vidéo. NULL = pas calé.
  try {
    const cols = db.prepare('PRAGMA table_info(entity_lyrics)').all() as { name: string }[];
    if (!cols.some((c) => c.name === 'offset_ms')) db.exec('ALTER TABLE entity_lyrics ADD COLUMN offset_ms INTEGER');
  } catch { /* colonne déjà là */ }
  ready = true;
}

/** Paroles synchro de l'entité, ou null si aucune (ligne vide = « tenté, rien trouvé »). */
export function getLyrics(ref: string): LrcLine[] | null {
  try {
    ensure();
    const row = getDb().prepare('SELECT synced_json FROM entity_lyrics WHERE entity_ref = ?').get(ref) as { synced_json?: string } | undefined;
    if (!row?.synced_json) return null;
    const arr = JSON.parse(row.synced_json) as LrcLine[];
    return Array.isArray(arr) && arr.length ? arr : null;
  } catch {
    return null;
  }
}

/**
 * Paroles + état de CALAGE (Pascal 2026-07-13). Si un offset OCR a été mesuré, on renvoie les
 * lignes AVEC leur timing DÉCALÉ (texte lrclib propre + timing vidéo) et calibrated=true → le
 * lecteur passe en karaoké synchro + coupe le CC natif. Sinon calibrated=false → lecture + CC natif.
 */
export function getSyncedLyrics(ref: string): { synced: LrcLine[]; calibrated: boolean; offsetMs: number } | null {
  try {
    ensure();
    const row = getDb().prepare('SELECT synced_json, offset_ms FROM entity_lyrics WHERE entity_ref = ?').get(ref) as { synced_json?: string; offset_ms?: number | null } | undefined;
    if (!row?.synced_json) return null;
    const arr = JSON.parse(row.synced_json) as LrcLine[];
    if (!Array.isArray(arr) || !arr.length) return null;
    const off = typeof row.offset_ms === 'number' ? row.offset_ms : null;
    if (off === null) return { synced: arr, calibrated: false, offsetMs: 0 };
    const shifted = arr.map((l) => ({ t: Math.max(0, l.t + off / 1000), text: l.text }));
    return { synced: shifted, calibrated: true, offsetMs: off };
  } catch {
    return null;
  }
}

/** A-t-on déjà un offset OCR mesuré pour cette entité ? (ne pas re-récolter en boucle). */
export function hasOffset(ref: string): boolean {
  try {
    ensure();
    const row = getDb().prepare('SELECT offset_ms FROM entity_lyrics WHERE entity_ref = ?').get(ref) as { offset_ms?: number | null } | undefined;
    return !!row && typeof row.offset_ms === 'number';
  } catch { return false; }
}

/** Enregistre l'offset OCR→vidéo (ms) mesuré pour l'entité. */
export function setLyricsOffset(ref: string, offsetMs: number): void {
  try { ensure(); getDb().prepare('UPDATE entity_lyrics SET offset_ms = ? WHERE entity_ref = ?').run(Math.round(offsetMs), ref); } catch { /* noop */ }
}

// ─── Fragments OCR bruts accumulés par entité (crowd) → matière pour la reconstruction IA. ───
let ocrReady = false;
function ensureOcr(): void {
  if (ocrReady) return;
  getDb().exec("CREATE TABLE IF NOT EXISTS entity_ocr (entity_ref TEXT PRIMARY KEY, frags_json TEXT NOT NULL DEFAULT '[]', built_json TEXT, updated_at INTEGER NOT NULL);");
  ocrReady = true;
}

/** Ajoute des fragments OCR (texte, temps vidéo) à l'entité, dédup ; renvoie le total accumulé. */
export function addOcrFragments(ref: string, frags: { text: string; t: number }[]): number {
  try {
    ensureOcr();
    const row = getDb().prepare('SELECT frags_json FROM entity_ocr WHERE entity_ref=?').get(ref) as { frags_json?: string } | undefined;
    const cur: { text: string; t: number }[] = row?.frags_json ? JSON.parse(row.frags_json) : [];
    const key = (f: { text: string; t: number }) => Math.round(f.t) + '|' + f.text.replace(/\s+/g, ' ').slice(0, 24);
    const seen = new Set(cur.map(key));
    for (const f of frags) {
      if (!f || typeof f.t !== 'number' || typeof f.text !== 'string' || f.text.trim().length < 3) continue;
      const k = key(f);
      if (!seen.has(k)) { seen.add(k); cur.push({ text: f.text.slice(0, 200), t: Math.round(f.t * 100) / 100 }); }
    }
    const capped = cur.sort((a, b) => a.t - b.t).slice(0, 600);
    getDb().prepare('INSERT INTO entity_ocr (entity_ref, frags_json, updated_at) VALUES (?,?,?) ON CONFLICT(entity_ref) DO UPDATE SET frags_json=excluded.frags_json, updated_at=excluded.updated_at')
      .run(ref, JSON.stringify(capped), Date.now());
    return capped.length;
  } catch { return 0; }
}

/** Tous les fragments OCR accumulés pour l'entité. */
export function getOcrFragments(ref: string): { text: string; t: number }[] {
  try {
    ensureOcr();
    const row = getDb().prepare('SELECT frags_json FROM entity_ocr WHERE entity_ref=?').get(ref) as { frags_json?: string } | undefined;
    return row?.frags_json ? JSON.parse(row.frags_json) : [];
  } catch { return []; }
}

export function setLyrics(ref: string, synced: LrcLine[], source: string): void {
  ensure();
  getDb()
    .prepare('INSERT OR REPLACE INTO entity_lyrics (entity_ref, synced_json, source, created_at) VALUES (?,?,?,?)')
    .run(ref, JSON.stringify(synced), source, Date.now());
}

/** A-t-on DÉJÀ tenté cette entité (même sans résultat) ? → ne pas re-fetcher en boucle. */
function alreadyTried(ref: string): boolean {
  try { ensure(); return !!getDb().prepare('SELECT 1 FROM entity_lyrics WHERE entity_ref = ?').get(ref); } catch { return false; }
}

/** Parse du LRC `[mm:ss.xx] texte` → lignes triées {t,text}. Ignore les lignes sans timecode. */
export function parseLrc(lrc: string): LrcLine[] {
  const out: LrcLine[] = [];
  const stampRe = /\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g;
  for (const raw of (lrc || '').split('\n')) {
    const head = raw.match(/^((?:\[\d{1,2}:\d{2}(?:[.:]\d{1,3})?\])+)(.*)$/);
    if (!head) continue;
    const text = head[2].trim();
    let m: RegExpExecArray | null;
    stampRe.lastIndex = 0;
    while ((m = stampRe.exec(head[1]))) {
      const t = parseInt(m[1], 10) * 60 + parseInt(m[2], 10) + (m[3] ? parseInt(m[3].padEnd(3, '0'), 10) / 1000 : 0);
      out.push({ t, text });
    }
  }
  return out.filter((l) => l.text).sort((a, b) => a.t - b.t);
}

/** Titre nettoyé pour la recherche (retire « (Official Video) », « [HD] », etc.). */
function cleanTitle(title: string): string {
  return title
    .replace(/\((?:official|clip|video|audio|lyric|hd|4k|mv|explicit|clean|remaster[^)]*|remix)[^)]*\)/gi, '')
    .replace(/\[[^\]]*\]/g, '')
    .replace(/official (music )?video/gi, '')
    // Featuring en fin de titre : « ft. / feat. / featuring X » → retiré (lrclib matche mieux
    // sur artiste+titre principal ; sinon la recherche se restreint à 1 seul résultat fragile).
    .replace(/\s*(?:feat\.?|ft\.?|featuring)\s+.+$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** lrclib.net : cherche par titre, renvoie le 1er résultat AVEC paroles SYNCHRO. Best-effort. */
export async function fetchLrclibSynced(title: string): Promise<LrcLine[] | null> {
  try {
    const q = cleanTitle(title);
    if (q.length < 2) return null;
    const res = await fetch('https://lrclib.net/api/search?q=' + encodeURIComponent(q), {
      headers: { 'User-Agent': 'Talk2Me/1.0 (+https://talk2me.fr)' },
      signal: AbortSignal.timeout(9000),
    });
    if (!res.ok) return null;
    const arr = (await res.json()) as { syncedLyrics?: string }[];
    const hit = Array.isArray(arr) ? arr.find((r) => r.syncedLyrics && r.syncedLyrics.trim()) : null;
    if (!hit?.syncedLyrics) return null;
    const lines = parseLrc(hit.syncedLyrics);
    return lines.length >= 3 ? lines : null;
  } catch {
    return null;
  }
}

/** Récupère + range les paroles synchro de l'entité SI pas déjà tenté. fire-and-forget. */
export async function autoLyricsForEntity(ref: string, title: string): Promise<boolean> {
  try {
    if (!ref || alreadyTried(ref)) return false;
    const lines = await fetchLrclibSynced(title);
    // On écrit TOUJOURS une ligne (même vide) → un son sans paroles n'est pas re-fetché en boucle.
    setLyrics(ref, lines || [], lines ? 'lrclib' : 'none');
    return !!lines;
  } catch {
    return false;
  }
}

/**
 * Si `attachedAudio` porte un son YouTube → tente de ranger ses paroles synchro (karaoké) en tâche
 * de fond. À appeler à la création d'une card, comme l'auto-enrichi. Ne bloque jamais.
 */
export function autoLyricsIfSound(attachedAudio: unknown, fallbackTitle?: string): void {
  try {
    const a = attachedAudio as { title?: string } | undefined;
    const ytId = ytIdFromAudio(attachedAudio); // source unique : couvre meta.* + URL d'embed
    if (ytId) {
      const title = (a?.title || fallbackTitle || '').slice(0, 140);
      if (title) void autoLyricsForEntity(`yt:${ytId}`, title);
    }
  } catch {
    /* best-effort : ne bloque jamais la création */
  }
}
