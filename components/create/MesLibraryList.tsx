'use client';

/**
 * Écran « Mes X » pour Film / Album / Publicité (Pascal 2026-07-28, Phase 2 — cale le web sur le natif).
 * Source = la BIBLIOTHÈQUE `/api/library` (user_library), filtrée par `variant` ('film'|'album'|'pub')
 * — l'équivalent web de DevApi.libraryList() du natif (MyMediaScreen/MyPubsScreen). Liste + bouton +
 * qui ouvre le composer dédié (route pleine page).
 */
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Plus } from '@/lib/icons';

type LibItem = { id: string; variant: string; dotcard: string; created_at: number };
type Parsed = { id: string; title: string; cover: string | null };

function parse(item: LibItem): Parsed {
  let title = 'Sans titre';
  let cover: string | null = null;
  try {
    const c = JSON.parse(item.dotcard) as Record<string, unknown>;
    title = (c.title as string) || (c.name as string) || title;
    cover = (c.cover as string) || (c.image as string) || (c.poster as string) || (c.thumbnail as string) || null;
    if (!cover && Array.isArray(c.media) && c.media[0] && typeof c.media[0] === 'object') {
      cover = ((c.media[0] as Record<string, unknown>).url as string) || null;
    }
  } catch { /* dotcard illisible → valeurs par défaut */ }
  return { id: item.id, title, cover };
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
                <div className="w-full flex items-center gap-3 bg-[#F7F8FA] border border-[#EAECEF] rounded-2xl p-2.5">
                  <div className="w-14 h-14 shrink-0 rounded-xl bg-[#EDF0F4] overflow-hidden grid place-items-center">
                    {it.cover ? <img src={it.cover} alt="" className="w-full h-full object-cover" /> : <span className="text-[20px]">{emoji}</span>}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[14px] font-bold text-[#2F343A] truncate" style={{ fontFamily: "'Outfit',sans-serif" }}>{it.title}</div>
                  </div>
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
