/**
 * Talk2Me — /composer : éditeur de projet Composer (Pascal 2026-06-12).
 * Studio / table de montage : plan IA → scènes → aperçu → publication.
 * ?prompt= préremplit la demande (depuis le composer WYSIWYG).
 */
import Link from 'next/link';
import ComposerProjectEditor from '@/components/composer/ComposerProjectEditor';

export const dynamic = 'force-dynamic';

export default async function ComposerPage({ searchParams }: { searchParams: Promise<{ prompt?: string; project?: string }> }) {
  const sp = await searchParams;
  return (
    <main className="min-h-screen bg-neutral-950">
      <header className="sticky top-0 z-20 border-b border-neutral-800 bg-neutral-950/90 px-4 py-3 backdrop-blur">
        {/* Pascal 2026-06-18 : flèche retour — on était coincé sans sortie à l'étape prompt */}
        <div className="mx-auto flex max-w-6xl items-center gap-3">
          <Link href="/home" aria-label="Retour"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-neutral-700 text-lg text-neutral-300 hover:bg-neutral-800">←</Link>
          <h1 className="text-base font-semibold text-neutral-100">Composer Studio</h1>
        </div>
      </header>
      <ComposerProjectEditor initialPrompt={sp.prompt || ''} initialProjectId={sp.project || ''} />
    </main>
  );
}
