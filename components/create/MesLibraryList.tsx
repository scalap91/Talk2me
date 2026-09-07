'use client';

/**
 * Écran « Mes X » pour Film / Album / Publicité (Pascal 2026-07-28, Phase 2 — cale le web sur le natif).
 * Source = la BIBLIOTHÈQUE `/api/library` (user_library), filtrée par `variant` ('film'|'album'|'pub')
 * — l'équivalent web de DevApi.libraryList() du natif (MyMediaScreen/MyPubsScreen). Liste + bouton +
 * qui ouvre le composer dédié (route pleine page).
 *
 * ▶ = ÉCRAN DE LECTURE DÉDIÉ (Pascal 2026-09-07) : le lecteur album/film SEUL en plein écran (comme
 * le natif), PAS un feed scrollable avec d'autres posts. On rend AlbumPlayer/FilmPlayer sur la `.card`.
 * ✏️ = édition (composer en mode ?edit=).
 */
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Plus, Pencil, Play, X } from '@/lib/icons';
import { parseCard, type SuperCard } from '@/lib/cards/supercard';
import { AlbumPlayer, FilmPlayer } from '@/components/feed/MediaCardPlayers';

type LibItem = { id: string; variant: string; dotcard: string; created_at: number };
type Parsed = { id: string; title: string; cover: string | null; dotcard: string };

function parse(item: LibItem): Parsed {
  let title = 'Sans titre';
  let cover: string | null = null;
  try {
    const c = JSON.parse(item.dotcard) as Record<string, unknown>;
    title = (c.title as string) || (c.name as string) || title;
    // La `.card` album/film porte la pochette dans `images[0]` (ou audio/video.thumbnail) — l'ancien
    // parse ne regardait que cover/image/poster → pochette vide (note ♪) : on couvre tous les cas.
    const audio = (c.audio && typeof c.audio === 'object' ? c.audio as Record<string, unknown> : null);
    const video = (c.video && typeof c.video === 'object' ? c.video as Record<string, unknown> : null);
    cover = (c.cover as string) || (c.image as string) || (c.poster as string) || (c.thumbnail as string)
      || (Array.isArray(c.images) && typeof c.images[0] === 'string' ? c.images[0] as string : null)
      || (audio?.thumbnail as string) || (video?.poster as string) || null;
    if (!cover && Array.isArray(c.media) && c.media[0] && typeof c.media[0] === 'object') {
      cover = ((c.media[0] as Record<string, unknown>).url as string) || null;
    }
  } catch { /* dotcard illisible → valeurs par défaut */ }
  return { id: item.id, title, cover, dotcard: item.dotcard };
}

export default function MesLibraryList({
  title, emoji, emptyText, variant, createHref,
}: {
  title: string;
  emoji: string;
  emptyText: string;
  variant: 'film' | 'album' | 'pub';
  createHref: string;
}) {
  const router = useRouter();
  const [items, setItems] = useState<Parsed[]>([]);
  const [loading, setLoading] = useState(true);
  // Écran de lecture (overlay plein écran) : la card à lire, SEULE. null = liste.
  const [reading, setReading] = useState<SuperCard | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/library', { cache: 'no-store' });
      const d = await r.json();
      const list: LibItem[] = Array.isArray(d?.items) ? d.items : [];
      setItems(list.filter((i) => i.variant === variant).map(parse));
    } catch { setItems([]); }
    setLoading(false);
  }, [variant]);
  useEffect(() => { load(); }, [load]);

  function open(it: Parsed) {
    const r = parseCard(it.dotcard);
    if (r.ok && r.card) setReading(r.card);
  }

  // ── ÉCRAN DE LECTURE DÉDIÉ (comme le natif) : le lecteur SEUL, plein écran, bouton retour. ──
  if (reading) {
    return (
      <div className="fixed inset-0 z-[60] bg-black overflow-y-auto">
        <button type="button" onClick={() => setReading(null)} aria-label="Retour"
          className="fixed top-3 left-3 z-[61] w-10 h-10 grid place-items-center rounded-full bg-black/45 text-white backdrop-blur active:scale-95"
          style={{ top: 'calc(env(safe-area-inset-top) + 10px)' }}>
          <X className="w-5 h-5" />
        </button>
        {variant === 'film'
          ? <FilmPlayer card={reading} isOwner bought />
          : <AlbumPlayer card={reading} isOwner bought />}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <header className="sticky top-0 z-10 flex items-center gap-2 px-3 h-14 bg-white border-b border-[#EDF0F4]">
        <button type="button" onClick={() => router.back()} aria-label="Retour" className="w-9 h-9 grid place-items-center rounded-full text-[#2F343A] active:scale-95">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-[17px] font-extrabold text-[#2F343A]" style={{ fontFamily: "'Outfit',sans-serif" }}>{title}</h1>
      </header>

      <div className="px-4 pt-3 pb-28">
        {loading ? (
          <p className="text-center text-[#9DAAB7] text-[13px] mt-10">Chargement…</p>
        ) : items.length === 0 ? (
          <div className="text-center mt-16 px-6">
            <div className="text-[40px] mb-2">{emoji}</div>
            <p className="text-[15px] font-bold text-[#2F343A]" style={{ fontFamily: "'Outfit',sans-serif" }}>Rien pour l’instant</p>
            <p className="text-[13px] text-[#6A7585] mt-1">{emptyText}</p>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {items.map((it) => (
              <li key={it.id}>
                {/* Parité NATIF (MyMediaScreen) : ✏️ éditer + ▶ ouvrir l'ÉCRAN DE LECTURE dédié (le
                    lecteur seul, pas un feed). Cover/titre/▶ ouvrent la lecture ; ✏️ ouvre le composer. */}
                <div className="w-full flex items-center gap-3 bg-[#F7F8FA] border border-[#EAECEF] rounded-2xl p-2.5">
                  <button type="button" onClick={() => open(it)} className="w-14 h-14 shrink-0 rounded-xl bg-[#EDF0F4] overflow-hidden grid place-items-center active:scale-95" aria-label="Écouter / ouvrir">
                    {it.cover ? <img src={it.cover} alt="" className="w-full h-full object-cover" /> : <span className="text-[20px]">{emoji}</span>}
                  </button>
                  <button type="button" onClick={() => open(it)} className="min-w-0 flex-1 text-left active:opacity-70" aria-label="Écouter / ouvrir">
                    <div className="text-[14px] font-bold text-[#2F343A] truncate" style={{ fontFamily: "'Outfit',sans-serif" }}>{it.title}</div>
                  </button>
                  <button type="button" onClick={() => router.push(`${createHref}?edit=${it.id}`)} aria-label="Modifier" className="w-9 h-9 shrink-0 grid place-items-center rounded-full text-[#6A7585] hover:bg-black/5 active:scale-95">
                    <Pencil className="w-[19px] h-[19px]" />
                  </button>
                  <button type="button" onClick={() => open(it)} aria-label="Écouter / ouvrir" className="w-9 h-9 shrink-0 grid place-items-center rounded-full text-[#FF7F11] hover:bg-[#FF7F11]/10 active:scale-95">
                    <Play className="w-[20px] h-[20px]" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <button type="button" onClick={() => router.push(createHref)} aria-label={`Ajouter — ${title}`} className="fixed bottom-24 right-5 w-14 h-14 rounded-2xl bg-[#FF7F11] text-white grid place-items-center shadow-[0_8px_24px_rgba(255,127,17,0.4)] active:scale-95">
        <Plus className="w-7 h-7" />
      </button>
    </div>
  );
}
