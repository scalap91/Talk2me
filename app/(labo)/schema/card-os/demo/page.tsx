/**
 * /schema/card-os/demo — PREUVE du moteur SuperCard (Card OS, Pascal 2026-06-30).
 * Charge de vrais fichiers .card et montre : 1 fichier → rendu unique (mini/normal/full),
 * envoyer (.card), recevoir (.card). Page interne (dev-only via schema/layout).
 */
import Link from 'next/link';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import CardOsDemo from '@/components/cards/CardOsDemo';

export const dynamic = 'force-dynamic';

const FILES = ['demo-ali.card', 'demo-promo.card', 'demo-chez-mario.card', 'demo-clio.card', 'demo-video.card'];

export default function CardOsDemoPage() {
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
          <h1 className="text-[15px] font-medium">Moteur SuperCard — preuve</h1>
          <span className="w-16" />
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-4 py-8 space-y-5">
        <p className="rounded-2xl border border-fuchsia-400/25 bg-fuchsia-500/[0.06] p-4 text-[13px] text-white/80 leading-relaxed">
          <b>Première brique du Card OS.</b> Chaque bloc ci-dessous part d&apos;un <b>vrai fichier <code>.card</code></b>
          (dans <code>public/cards/</code>, ouvrable/partageable par URL). Le <b>même moteur unique</b>
          (<code>SuperCardView</code>) l&apos;affiche en <b>mini / normal / full</b> — c&apos;est le « le lecteur choisit ce
          qu&apos;il révèle ». Tu peux <b>envoyer</b> (télécharger) un <code>.card</code> et en <b>recevoir</b> un
          (coller ou ouvrir une URL). C&apos;est le « comme un PDF » : un fichier portable, lu partout.
        </p>
        {samples.length === 0 ? (
          <p className="text-white/50 text-[13px]">Aucun fichier .card trouvé dans public/cards/.</p>
        ) : (
          <CardOsDemo samples={samples} />
        )}
        <p className="text-[11px] text-white/30">
          Moteur : <code>lib/cards/supercard.ts</code> (format + parse/serialize) · <code>lib/cards/adapt.ts</code> (façade existant→SuperCard) · <code>components/cards/SuperCardView.tsx</code> (rendu unique).
        </p>
      </div>
    </main>
  );
}
