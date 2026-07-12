/**
 * Talk2Me — PAROLES SYNCHRONISÉES (karaoké) d'une entité son (Pascal 2026-07-11).
 *
 * Best-effort « on affiche quand y'a, sinon rien ». Source = lrclib.net (LRC synchro, gratuit, sans
 * token) cherché par TITRE du son, rangé PAR ENTITÉ (clé yt:<id>) comme l'article ([[article]]).
 * NB : les captions YouTube sont FERMÉES côté serveur (prouvé : HTML dépouillé + InnerTube tokené) →
 * lrclib est la seule source synchro fiable (mainstream ; le local n'aura pas de karaoké, assumé).
 */
import { getDb } from '@/lib/db';

export type LrcLine = { t: number; text: string };

let ready = false;
function ensure(): void {
  if (ready) return;
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS entity_lyrics (
      entity_ref  TEXT PRIMARY KEY,
      synced_json TEXT NOT NULL DEFAULT '[]',
      source      TEXT NOT NULL DEFAULT '',
      created_at  INTEGER NOT NULL
    );
  `);
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
    .replace(/\((?:official|clip|video|audio|lyric|hd|4k|mv)[^)]*\)/gi, '')
    .replace(/\[[^\]]*\]/g, '')
    .replace(/official (music )?video/gi, '')
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
    const a = attachedAudio as { video_id?: string; youtube_video_id?: string; title?: string; media?: { video_id?: string } } | undefined;
    const ytId = a && (a.video_id || a.youtube_video_id || a.media?.video_id);
    if (ytId && /^[A-Za-z0-9_-]{6,20}$/.test(ytId)) {
      const title = (a?.title || fallbackTitle || '').slice(0, 140);
      if (title) void autoLyricsForEntity(`yt:${ytId}`, title);
    }
  } catch {
    /* best-effort : ne bloque jamais la création */
  }
}
