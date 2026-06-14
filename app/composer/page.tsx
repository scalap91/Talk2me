/**
 * Talk2Me — /composer : éditeur de projet Composer (Pascal 2026-06-12).
 * Studio / table de montage : plan IA → scènes → aperçu → publication.
 * ?prompt= préremplit la demande (depuis le composer WYSIWYG).
 */
import ComposerProjectEditor from '@/components/composer/ComposerProjectEditor';

export const dynamic = 'force-dynamic';

export default async function ComposerPage({ searchParams }: { searchParams: Promise<{ prompt?: string; project?: string }> }) {
  const sp = await searchParams;
  return (
    <main className="min-h-screen bg-neutral-950">
      <header className="sticky top-0 z-20 border-b border-neutral-800 bg-neutral-950/90 px-4 py-3 backdrop-blur">
        <h1 className="mx-auto max-w-6xl text-base font-semibold text-neutral-100">Composer Studio</h1>
      </header>
      <ComposerProjectEditor initialPrompt={sp.prompt || ''} initialProjectId={sp.project || ''} />
    </main>
  );
}
