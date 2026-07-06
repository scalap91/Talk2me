/**
 * /schema/card-os/lecteurs — LES LECTEURS (Card OS, Pascal 2026-06-30). Montre la MÊME
 * pile de vraies cards .card lue par chaque lecteur (Feed/Eat/Boutique/Annonces/Recherche/
 * Profil/Carte) via son profil. Preuve du « 1 card, N lecteurs ». Page interne (dev-only).
 */
import Link from 'next/link';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import CardReadersDemo from '@/components/cards/CardReadersDemo';

export const dynamic = 'force-dynamic';

const FILES = ['demo-promo.card', 'demo-ali.card', 'demo-chez-mario.card', 'demo-clio.card', 'demo-video.card'];

export default function CardReadersPage() {
  const dir = path.join(process.cwd(), 'public', 'cards');
  const samples = FILES
    .map((name) => {
      const p = path.join(dir, name);
      return existsSync(p) ? { name, text: readFileSync(p, 'utf8') } : null;
    })
    .filter(Boolean) as { name: string; text: string }[];

  return (
    <main className="min-h-[100svh] w-full bg-[#0e0e12] text-white">
      <header className="sticky top-0 z-40 border-b border-white/8 bg-[#0e0e12]/85 backdrop-blur-xl">
        <div className="mx-auto max-w-5xl px-4 h-14 flex items-center justify-between">
          <Link href="/schema/card-os" className="text-white/55 hover:text-white/90 text-[13px]">← Card OS</Link>
          <h1 className="text-[15px] font-medium">Les lecteurs</h1>
          <Link href="/schema/card-os/demo" className="text-fuchsia-300/90 hover:text-fuchsia-200 text-[13px]">Moteur →</Link>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-4 py-8 space-y-5">
        <p className="rounded-2xl border border-fuchsia-400/25 bg-fuchsia-500/[0.06] p-4 text-[13px] text-white/80 leading-relaxed">
          La <b>même pile de cards</b> ci-dessous, lue par chaque <b>lecteur</b>. Clique un onglet : le Feed les empile,
          la Boutique les met en grille avec « Acheter », Eat passe en plein avec « Réserver », la Recherche en vignettes…
          <b> Une seule card, plusieurs lecteurs.</b> Un lecteur ne fait que choisir niveau + actions + layout — aucun
          composant de card dédié.
        </p>
        {samples.length === 0 ? (
          <p className="text-white/50 text-[13px]">Aucun fichier .card trouvé.</p>
        ) : (
          <CardReadersDemo samples={samples} />
        )}
        <p className="text-[11px] text-white/30">Profils : <code>lib/cards/readers.ts</code> · lecteur générique : <code>components/cards/CardReader.tsx</code> · moteur : <code>SuperCardView</code>.</p>
      </div>
    </main>
  );
}
