/**
 * /credits/audio — page de transparence sur les sources musicales de
 * la bibliothèque audio de l'éditeur VideoCard.
 *
 * Talk2Me #420. Bonne pratique légale : chaque track de
 * /public/audio-lib/index.json est listée avec son `source` et `license`.
 */

import { readFileSync } from 'fs';
import Link from 'next/link';

const INDEX_PATH = process.cwd() + '/public/audio-lib/index.json';

interface LibEntry {
  id: string;
  name: string;
  category: string;
  duration_sec: number;
  file: string;
  source: string;
  license: string;
  bpm?: number;
  mood?: string;
}

function loadIndex(): LibEntry[] {
  try {
    const raw = readFileSync(INDEX_PATH, 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Crédits audio — Talk2Me',
  description: 'Sources et licences de la bibliothèque musicale Talk2Me.',
};

export default function CreditsAudioPage() {
  const tracks = loadIndex();
  const byCategory: Record<string, LibEntry[]> = {};
  for (const t of tracks) {
    if (!byCategory[t.category]) byCategory[t.category] = [];
    byCategory[t.category].push(t);
  }

  // Compte sources distinctes
  const sources = Array.from(new Set(tracks.map((t) => t.source))).sort();

  return (
    <main className="min-h-screen bg-[var(--t2m-paper)] text-[var(--t2m-ink)] px-5 py-10">
      <div className="max-w-3xl mx-auto space-y-8">
        <header className="space-y-2">
          <Link
            href="/home"
            className="text-[var(--t2m-ink-3)] text-[12px] hover:text-[var(--t2m-ink)]"
          >
            ← Retour
          </Link>
          <h1 className="text-2xl font-semibold">Crédits audio</h1>
          <p className="text-[var(--t2m-ink-2)] text-[14px] leading-relaxed">
            Talk2Me met à disposition de ses utilisateurs une bibliothèque
            musicale libre de droits, utilisable dans l&apos;éditeur de
            VideoCard. Cette page liste toutes les pistes, leur source et
            leur licence pour transparence légale.
          </p>
          <p className="text-[var(--t2m-ink-3)] text-[12px]">
            {tracks.length} pistes · {sources.length} source{sources.length > 1 ? 's' : ''}
          </p>
        </header>

        {sources.length > 0 && (
          <section className="rounded-2xl bg-white border border-[var(--t2m-line)] shadow-[0_2px_10px_rgba(47,52,58,.05)] p-4">
            <h2 className="text-[13px] uppercase tracking-wide text-[var(--t2m-ink-3)] mb-2">
              Sources utilisées
            </h2>
            <ul className="space-y-1 text-[13.5px] text-[var(--t2m-ink-2)]">
              {sources.map((s) => (
                <li key={s} className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-300" />
                  {s}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[11.5px] text-[var(--t2m-ink-3)] leading-relaxed">
              Toutes les pistes de cette bibliothèque sont
              <strong className="text-[var(--t2m-ink-2)]"> libres de droits </strong>
              en usage commercial. Aucune attribution n&apos;est requise
              pour les utilisateurs Talk2Me qui les ajoutent à leurs vidéos.
            </p>
          </section>
        )}

        {Object.entries(byCategory).map(([cat, list]) => (
          <section
            key={cat}
            className="rounded-2xl bg-white border border-[var(--t2m-line)] shadow-[0_2px_10px_rgba(47,52,58,.05)] overflow-hidden"
          >
            <h2 className="text-[13px] uppercase tracking-wide text-[var(--t2m-ink-3)] px-4 py-3 border-b border-[var(--t2m-line)]">
              {cat} ({list.length})
            </h2>
            <ul className="divide-y divide-[var(--t2m-line)]">
              {list.map((t) => (
                <li
                  key={t.id}
                  className="px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1"
                >
                  <span className="text-[var(--t2m-ink)] text-[13.5px]">
                    {t.name}{' '}
                    <span className="text-[var(--t2m-ink-3)] text-[11.5px]">
                      ({Math.floor(t.duration_sec / 60)}:
                      {Math.floor(t.duration_sec % 60)
                        .toString()
                        .padStart(2, '0')}
                      {t.bpm ? ` · ${t.bpm} bpm` : ''}
                      {t.mood ? ` · ${t.mood}` : ''})
                    </span>
                  </span>
                  <span className="text-[11.5px] text-[var(--t2m-ink-3)]">
                    {t.source} · <span className="text-[var(--t2m-ink-2)]">{t.license}</span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))}

        <section className="rounded-2xl bg-white border border-[var(--t2m-line)] shadow-[0_2px_10px_rgba(47,52,58,.05)] p-4 text-[12.5px] text-[var(--t2m-ink-2)] leading-relaxed">
          <h2 className="text-[13px] uppercase tracking-wide text-[var(--t2m-ink-3)] mb-2">
            Notes utilisateurs
          </h2>
          <ul className="list-disc pl-4 space-y-1">
            <li>
              Vous pouvez aussi uploader votre propre fichier audio pour
              votre VideoCard. Vous êtes responsable du respect des droits
              de la musique que vous uploadez.
            </li>
            <li>
              Si vous utilisez la bibliothèque ci-dessus, aucune mention
              d&apos;attribution n&apos;est nécessaire dans votre vidéo.
            </li>
            <li>
              Pour signaler un litige éventuel sur une piste de la
              bibliothèque, contactez <code>contact@talk2me.fr</code>.
            </li>
          </ul>
        </section>
      </div>
    </main>
  );
}
