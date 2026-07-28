/**
 * POST /api/cards/media/publish — publie un ALBUM (musique) ou un FILM natif comme VRAI `.card`.
 * Pascal 2026-07-17. Miroir de /api/formation/publish : direct_card (handle feed/Mes Cards) +
 * moteur (table cards, pour le feed ?src=cards) + fichier `.card` riche (writeCardFile), que le
 * lecteur unique relit et rend. Fini le `librarySave` seul qui n'existait ni au feed ni sur le web.
 *
 * Body album : { kind:'album', title, artist?, cover(/uploads), tracks:[{title,artist?,url(/uploads),duration?}], price?:{amount,currency} }
 * Body film  : { kind:'film', title, cover?(/uploads), trailer?(/uploads), full?(/uploads), synopsis?, price?:{amount,currency} }
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { createDirectCard, getDb } from '@/lib/db';
import { cardRepository } from '@/lib/cards/engine/card.repository';
import { writeCardFile } from '@/lib/cards/card-file';
import { serializeCard } from '@/lib/cards/supercard';
import { buildAlbumCard, buildFilmCard, type AlbumTrackInput } from '@/lib/cards/album-film';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Média SERVEUR uniquement : accepte `/uploads/x` OU `https://<host>/uploads/x` (natif envoie
// parfois l'URL absolue) → normalise en chemin relatif. Refuse tout le reste (fichier LOCAL du
// téléphone = inutilisable pour une card de feed partagée).
function normUpload(u: unknown): string | null {
  if (typeof u !== 'string' || !u) return null;
  if (u.startsWith('/uploads/')) return u;
  const m = u.match(/^https?:\/\/[^/]+(\/uploads\/.+)$/);
  return m ? m[1] : null;
}
const isUpload = (u: unknown): u is string => normUpload(u) !== null;

// Métadonnées musicales DDEX : passthrough BORNÉ (whitelist des 5 couches + coupe la taille). On
// ne stocke que du JSON simple sérialisable, jamais de fichier local ni d'objet géant. Cf supercard.music.
function readMusic(m: unknown): NonNullable<import('@/lib/cards/supercard').SuperCard['music']> | undefined {
  if (!m || typeof m !== 'object' || Array.isArray(m)) return undefined;
  let clean: Record<string, unknown>;
  try { clean = JSON.parse(JSON.stringify(m)) as Record<string, unknown>; } catch { return undefined; }
  if (JSON.stringify(clean).length > 20000) return undefined; // garde-fou taille
  const layer = (k: string) => (clean[k] && typeof clean[k] === 'object' && !Array.isArray(clean[k]) ? clean[k] : undefined);
  const out = { work: layer('work'), recording: layer('recording'), release: layer('release'), rights: layer('rights'), ids: layer('ids') };
  return Object.values(out).some((v) => v) ? (out as NonNullable<import('@/lib/cards/supercard').SuperCard['music']>) : undefined;
}

function readPrice(p: unknown): { amount?: number; currency?: string } | undefined {
  if (!p || typeof p !== 'object') return undefined;
  const o = p as { amount?: unknown; currency?: unknown };
  const amount = typeof o.amount === 'number' ? o.amount : (typeof o.amount === 'string' ? parseInt(o.amount, 10) : NaN);
  if (!Number.isFinite(amount) || amount <= 0) return undefined;
  return { amount: Math.round(amount), currency: typeof o.currency === 'string' ? o.currency.slice(0, 8) : 'Ar' };
}

export async function POST(req: NextRequest) {
  const me = getCurrentUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'bad_json' }, { status: 400 }); }

  const kind = body.kind === 'film' ? 'film' : body.kind === 'album' ? 'album' : null;
  if (!kind) return NextResponse.json({ error: 'invalid_kind' }, { status: 400 });
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const cover = isUpload(body.cover) ? body.cover : null;
  const price = readPrice(body.price);
  // Description = le bloc texte de la carte. Sert AUSSI de caption du post de feed (sinon le feed
  // n'affiche que le titre). Le film accepte synopsis OU description.
  const description = (typeof body.description === 'string' ? body.description.trim() : '').slice(0, 4000);
  const filmText = (typeof body.synopsis === 'string' && body.synopsis.trim() ? body.synopsis.trim() : description).slice(0, 4000);

  // ÉDITION : si `card_id` fourni ET la card m'appartient → mise à jour EN PLACE (même id, pas de
  // doublon ; le .card file est réécrit, le feed le relit). Sinon création normale (nouvel id).
  const editId = typeof body.card_id === 'string' && body.card_id.trim() ? body.card_id.trim() : null;
  if (editId) {
    // Propriété fiable = la bibliothèque PAR-USER (couvre TOUS les albums, même anciens/absents de
    // la table `cards`). Sécurisé : on ne réécrit un .card que si l'id est dans MA bibliothèque.
    const owns = getDb().prepare('SELECT 1 FROM user_library WHERE id = ? AND user_id = ?').get(editId, me.id);
    if (!owns) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  try {
    if (kind === 'album') {
      // Pistes MP3 uploadées obligatoires + pochette.
      const rawTracks = Array.isArray(body.tracks) ? body.tracks : [];
      const tracks: AlbumTrackInput[] = rawTracks
        .filter((t): t is Record<string, unknown> => !!t && typeof t === 'object' && isUpload((t as Record<string, unknown>).url))
        .map((t) => ({
          title: typeof t.title === 'string' && t.title.trim() ? t.title.trim().slice(0, 120) : 'Piste',
          artist: typeof t.artist === 'string' ? t.artist.trim().slice(0, 80) || undefined : undefined,
          url: t.url as string,
          duration: typeof t.duration === 'string' ? t.duration.slice(0, 12) : undefined,
        }))
        .slice(0, 40);
      if (!cover) return NextResponse.json({ error: 'cover_required' }, { status: 400 });
      if (tracks.length === 0) return NextResponse.json({ error: 'tracks_required' }, { status: 400 });

      const albumCaption = description || title || 'Album'; // le feed affiche la caption → mettre la description
      const cardId = editId ?? createDirectCard(me.id, { type: 'image', media_url: cover, caption: albumCaption }).id;
      // ÉDITION : garantir l'index direct_cards (source du feed) — sinon la card existe mais reste
      // INVISIBLE au feed (le bug des « deux sources »). Idempotent : ne fait rien si déjà là.
      if (editId) getDb().prepare('INSERT OR IGNORE INTO direct_cards (id,user_id,type,media_url,caption,created_at) VALUES (?,?,?,?,?,?)').run(cardId, me.id, 'image', cover, albumCaption, Date.now());
      const card = buildAlbumCard(cardId, {
        title, artist: typeof body.artist === 'string' ? body.artist.trim().slice(0, 80) : undefined,
        description: typeof body.description === 'string' ? body.description.trim().slice(0, 4000) : undefined,
        cover, tracks, price, music: readMusic(body.music),
      }, me.id);
      try { cardRepository.save(card); } catch { /* best-effort moteur */ }
      await writeCardFile(card);
      return NextResponse.json({ ok: true, card_id: cardId, dotcard: serializeCard(card) });
    }

    // FILM
    const trailer = isUpload(body.trailer) ? body.trailer : null;
    const full = isUpload(body.full) ? body.full : null;
    if (!trailer && !full) return NextResponse.json({ error: 'video_required' }, { status: 400 });
    const main = trailer || full!;

    const filmCaption = filmText || title || 'Film'; // le feed affiche la caption → mettre la description/synopsis
    const filmId = editId ?? createDirectCard(me.id, { type: 'video', media_url: main, caption: filmCaption }).id;
    if (editId) getDb().prepare('INSERT OR IGNORE INTO direct_cards (id,user_id,type,media_url,caption,created_at) VALUES (?,?,?,?,?,?)').run(filmId, me.id, 'video', main, filmCaption, Date.now());
    const card = buildFilmCard(filmId, {
      title, cover: cover || undefined, trailer: trailer || undefined, full: full || undefined,
      synopsis: filmText || undefined, price,
    }, me.id);
    try { cardRepository.save(card); } catch { /* best-effort moteur */ }
    await writeCardFile(card);
    return NextResponse.json({ ok: true, card_id: filmId, dotcard: serializeCard(card) });
  } catch (err) {
    console.error('[cards/media/publish] error:', err);
    return NextResponse.json({ error: 'internal' }, { status: 500 });
  }
}
