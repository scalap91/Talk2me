/**
 * /credits/audio — page de transparence sur les sources musicales de
 * la bibliothèque audio de l'éditeur VideoCard.
 *
 * Talk2Me #420. Bonne pratique légale : chaque track de
 * /public/audio-lib/index.json est listée avec son `source` et `license`.
 */

import { readFileSync } from 'fs';
import Link from 'next/link';

const INDEX_PATH = '/home/ubuntu/talktome/public/audio-lib/index.json';

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
    <main className="min-h-screen bg-[#0a0a0d] text-white px-5 py-10">
      <div className="max-w-3xl mx-auto space-y-8">
        <header className="space-y-2">
          <Link
            href="/home"
            className="text-white/55 text-[12px] hover:text-white"
          >
            ← Retour
          </Link>
          <h1 className="text-2xl font-semibold">Crédits audio</h1>
          <p className="text-white/65 text-[14px] leading-relaxed">
            Talk2Me met à disposition de ses utilisateurs une bibliothèque
            musicale libre de droits, utilisable dans l&apos;éditeur de
            VideoCard. Cette page liste toutes les pistes, leur source et
            leur licence pour transparence légale.
          </p>
          <p className="text-white/45 text-[12px]">
            {tracks.length} pistes · {sources.length} source{sources.length > 1 ? 's' : ''}
          </p>
        </header>

        {sources.length > 0 && (
          <section className="rounded-2xl bg-white/[0.03] border border-white/8 p-4">
            <h2 className="text-[13px] uppercase tracking-wide text-white/55 mb-2">
              Sources utilisées
            </h2>
            <ul className="space-y-1 text-[13.5px] text-white/85">
              {sources.map((s) => (
                <li key={s} className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-violet-300" />
                  {s}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[11.5px] text-white/45 leading-relaxed">
              Toutes les pistes de cette bibliothèque sont
              <strong className="text-white/75"> libres de droits </strong>
              en usage commercial. Aucune attribution n&apos;est requise
              pour les utilisateurs Talk2Me qui les ajoutent à leurs vidéos.
            </p>
          </section>
        )}

        {Object.entries(byCategory).map(([cat, list]) => (
          <section
            key={cat}
            className="rounded-2xl bg-white/[0.02] border border-white/8 overflow-hidden"
          >
            <h2 className="text-[13px] uppercase tracking-wide text-white/55 px-4 py-3 border-b border-white/8">
              {cat} ({list.length})
            </h2>
            <ul className="divide-y divide-white/5">
              {list.map((t) => (
                <li
                  key={t.id}
                  className="px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1"
                >
                  <span className="text-white/90 text-[13.5px]">
                    {t.name}{' '}
                    <span className="text-white/40 text-[11.5px]">
                      ({Math.floor(t.duration_sec / 60)}:
                      {Math.floor(t.duration_sec % 60)
                        .toString()
                        .padStart(2, '0')}
                      {t.bpm ? ` · ${t.bpm} bpm` : ''}
                      {t.mood ? ` · ${t.mood}` : ''})
                    </span>
                  </span>
                  <span className="text-[11.5px] text-white/50">
                    {t.source} · <span className="text-white/70">{t.license}</span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))}

        <section className="rounded-2xl bg-white/[0.02] border border-white/8 p-4 text-[12.5px] text-white/65 leading-relaxed">
          <h2 className="text-[13px] uppercase tracking-wide text-white/55 mb-2">
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
