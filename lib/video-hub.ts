/**
 * Talk2Me — VIDEO CARD (Pascal 2026-08-29, Phase 1). Catalogue de FILMS ENTIERS GRATUITS de YouTube,
 * en passthrough (0 octet vidéo, embed officiel) — le jumeau vidéo de Music Card.
 *
 * Ingest AUTO via l'API YouTube Data v3 (clé YOUTUBE_API_KEY, déjà présente) : on cherche des vidéos
 * LONGUES (`videoDuration=long`) + EMBEDDABLES (`videoEmbeddable=true`), puis on VÉRIFIE chaque
 * candidat (`videos.list` part=status,contentDetails) pour ne garder QUE les films réellement
 * intégrables (status.embeddable) et assez longs (≥ 40 min). On INTERROGE la source, on ne scrape/rip
 * JAMAIS. Pas de clé → catalogue vide (dégradation propre, aucun faux). Pas de resell de contenu tiers.
 */
import 'server-only';

export interface FilmCard {
  video_id: string;
  title: string;
  channel: string;
  thumbnail: string;
  duration_sec: number;
  views: number | null;
  embed_url: string;
  youtube_url: string;
}

export const FILM_GENRES = [
  'Action', 'Comédie', 'Drame', 'Science-fiction', 'Horreur', 'Thriller',
  'Aventure', 'Romance', 'Policier', 'Guerre', 'Fantastique', 'Arts martiaux',
  'Familial', 'Animation', 'Documentaire', 'Western', 'Malgache',
] as const;

// Requête tunée par genre — un « <genre> film complet » brut rate les codes de recherche
// réels (ex. « film de guerre », « film gasy »). On vise le vocabulaire des chaînes YT FR.
const GENRE_QUERY: Record<string, string> = {
  'Action': 'film action complet en français',
  'Comédie': 'comédie film complet en français',
  'Drame': 'film dramatique complet en français',
  'Science-fiction': 'film science fiction complet en français',
  'Horreur': 'film horreur complet en français',
  'Thriller': 'film thriller complet en français',
  'Aventure': "film d'aventure complet en français",
  'Romance': "film d'amour complet en français",
  'Policier': 'film policier complet en français',
  'Guerre': 'film de guerre complet en français',
  'Fantastique': 'film fantastique complet en français',
  'Arts martiaux': 'film arts martiaux complet en français',
  'Familial': 'film famille complet en français',
  'Animation': "film d'animation complet en français",
  'Documentaire': 'documentaire complet en français',
  'Western': 'western film complet en français',
  'Malgache': 'film gasy malagasy complet', // Mada-first : contenu malgache
};

const KEY = () => (process.env.YOUTUBE_API_KEY || process.env.YOUTUBE_DATA_API_KEY)?.trim() || '';
const MIN_SEC = 40 * 60; // un « film » = ≥ 40 min (écarte trailers, extraits, clips)

// Cache par requête (6 h) — l'API YouTube a un quota, on ne re-crawle pas à chaque ouverture.
const cache = new Map<string, { data: FilmCard[]; at: number }>();
const TTL = 6 * 60 * 60 * 1000;

/** Durée ISO 8601 (PT1H52M3S) → secondes. */
function iso8601ToSec(d: string): number {
  const m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(d || '');
  if (!m) return 0;
  return (Number(m[1] || 0) * 3600) + (Number(m[2] || 0) * 60) + Number(m[3] || 0);
}

// ── « Est-ce VRAIMENT un film ? » (on n'est pas YouTube : pas de compil/live/podcast/tuto…) ──
// Catégories YouTube « film » : 1 = Film & Animation, 30 = Movies.
const FILM_CATEGORIES = new Set(['1', '30']);
// Signaux d'un FILM dans le titre (FR/EN) — tolère la catégorie Divertissement si le titre sent le film.
const FILM_HINT = /\bfilm\b|\bmovie\b|complet|entier|long[\s-]?m[ée]trage|full movie|t[ée]l[ée]film|film gasy|malagasy/i;
// Formats à REJETER même s'ils sont longs : bandes-annonces, extraits, lives, compil, tuto, séries…
const NOT_FILM = /bande[\s-]?annonce|trailer|teaser|\bextrait\b|clip officiel|\bmix\b|compilation|best[\s-]?of|r[ée]sum[ée]|highlights?|\bvlog\b|podcast|interview|reaction|r[ée]action|gameplay|walkthrough|\btuto\b|tutoriel|tutorial|making[\s-]?of|behind the scenes|coulisses|\breplay\b|\blive\b|en direct|\bep(?:isode)?\.?\s?\d|\bs\d+\s?e\d+\b/i;

/** Garde SEULEMENT les vrais films : rejette les formats non-film ; sinon exige catégorie Film/Movies OU un titre « film ». */
function isRealFilm(title: string, categoryId: string | undefined): boolean {
  const t = title || '';
  if (NOT_FILM.test(t)) return false;                            // format clairement non-film → jeté
  if (categoryId && FILM_CATEGORIES.has(categoryId)) return true; // Film & Animation / Movies → OK
  return FILM_HINT.test(t);                                       // autre catégorie tolérée UNIQUEMENT si le titre sent le film
}

/** Recherche de films : longs + embeddables, vérifiés un par un (embeddable réel + durée + « est un film »).
 *  `order` = pertinence (défaut) ou 'viewCount' pour un tri « tendance » côté YouTube. */
export async function searchFilms(query: string, limit = 24, order: 'relevance' | 'viewCount' | 'date' = 'relevance'): Promise<FilmCard[]> {
  const key = KEY();
  if (!key || !query.trim()) return [];
  // On ORIENTE la requête vers un film si l'utilisateur n'a pas déjà tapé un mot « film » — évite
  // que la recherche remonte n'importe quelle vidéo longue (on n'est pas YouTube).
  const q = FILM_HINT.test(query) ? query.trim() : `${query.trim()} film complet`;
  const ck = `s:${q.toLowerCase()}:${limit}:${order}`;
  const hit = cache.get(ck);
  if (hit && Date.now() - hit.at < TTL) return hit.data;
  try {
    // 1) SEARCH — restreint aux vidéos longues + déclarées embeddables.
    const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video`
      + `&videoDuration=long&videoEmbeddable=true&order=${order}&relevanceLanguage=fr&maxResults=${Math.min(50, limit * 2)}`
      + `&q=${encodeURIComponent(q)}&key=${key}`;
    const sr = await fetch(searchUrl, { signal: AbortSignal.timeout(15000) });
    if (!sr.ok) { cache.set(ck, { data: [], at: Date.now() }); return []; }
    const sj = (await sr.json()) as { items?: Array<{ id?: { videoId?: string } }> };
    const ids = (sj.items || []).map((it) => it.id?.videoId).filter((x): x is string => !!x);
    if (!ids.length) { cache.set(ck, { data: [], at: Date.now() }); return []; }

    // 2) VÉRIFIE chaque candidat : embeddable RÉEL + durée + stats (1 seul appel batch, ≤ 50 ids).
    const vidUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,status,statistics`
      + `&id=${ids.join(',')}&key=${key}`;
    const vr = await fetch(vidUrl, { signal: AbortSignal.timeout(15000) });
    if (!vr.ok) { cache.set(ck, { data: [], at: Date.now() }); return []; }
    const vj = (await vr.json()) as {
      items?: Array<{
        id?: string;
        snippet?: { title?: string; channelTitle?: string; liveBroadcastContent?: string; categoryId?: string; thumbnails?: Record<string, { url?: string }> };
        contentDetails?: { duration?: string };
        status?: { embeddable?: boolean; privacyStatus?: string };
        statistics?: { viewCount?: string };
      }>;
    };
    const films: FilmCard[] = [];
    for (const it of vj.items || []) {
      const id = it.id || '';
      const sn = it.snippet || {};
      const sec = iso8601ToSec(it.contentDetails?.duration || '');
      if (!id) continue;
      if (it.status?.embeddable !== true) continue;        // NON intégrable → on jette (sinon film qui ne joue pas)
      if (it.status?.privacyStatus && it.status.privacyStatus !== 'public') continue;
      if (sn.liveBroadcastContent && sn.liveBroadcastContent !== 'none') continue; // pas un live
      if (sec < MIN_SEC) continue;                          // trop court = pas un film
      if (!isRealFilm(sn.title || '', sn.categoryId)) continue; // pas un film (compil/live/tuto/série…) → jeté
      const thumb = sn.thumbnails?.high?.url || sn.thumbnails?.medium?.url || sn.thumbnails?.default?.url || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
      films.push({
        video_id: id,
        title: sn.title || 'Film',
        channel: sn.channelTitle || '',
        thumbnail: thumb,
        duration_sec: sec,
        views: it.statistics?.viewCount != null ? Number(it.statistics.viewCount) : null,
        embed_url: `https://www.youtube.com/embed/${id}?modestbranding=1&rel=0`,
        youtube_url: `https://www.youtube.com/watch?v=${id}`,
      });
      if (films.length >= limit) break;
    }
    cache.set(ck, { data: films, at: Date.now() });
    return films;
  } catch {
    return [];
  }
}

/** Fusionne plusieurs listes en dédupliquant par video_id (première occurrence gagne). */
function dedup(lists: FilmCard[][]): FilmCard[] {
  const seen = new Set<string>();
  const out: FilmCard[] = [];
  for (const l of lists) for (const f of l) { if (!seen.has(f.video_id)) { seen.add(f.video_id); out.push(f); } }
  return out;
}

/** Films d'un genre — requête tunée (cf. GENRE_QUERY), triés par vues décroissantes. */
export async function getFilmsByGenre(genre: string, limit = 24): Promise<FilmCard[]> {
  const g = (genre || '').trim() || 'Action';
  const q = GENRE_QUERY[g] || `${g} film complet en français`;
  const films = await searchFilms(q, limit, 'relevance');
  return films.sort((a, b) => (b.views || 0) - (a.views || 0));
}

/** « Tendances » = plusieurs genres populaires, requêtés en ORDER=viewCount, fusionnés puis
 *  re-triés par vues décroissantes → un vrai classement « les plus regardés » du moment. */
export async function getFilmsCatalog(limit = 24): Promise<FilmCard[]> {
  const seeds = [
    'film complet en français',
    'film action complet en français',
    'comédie film complet en français',
    'film gasy malagasy complet', // Mada-first
  ];
  const per = Math.ceil(limit / seeds.length) + 3;
  const lists = await Promise.all(seeds.map((s) => searchFilms(s, per, 'viewCount')));
  return dedup(lists)
    .sort((a, b) => (b.views || 0) - (a.views || 0))
    .slice(0, limit);
}
