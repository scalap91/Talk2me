'use client';

/**
 * Talk2Me #331 (Pascal 2026-06-04) — Page /saved-cards : bibliothèque
 * personnelle des cards bookmarkées par l'user.
 * Pascal 2026-08-05 : le CONTENU vit désormais dans l'onglet « Enregistrées »
 * du hub Card (/drafts). Cette page n'est plus liée depuis le profil ; elle
 * reste un habillage autour du MÊME composant (SavedCardsTab) — zéro duplication.
 */

import Link from 'next/link';
import { ArrowLeft } from '@/lib/icons';
import SavedCardsTab from '@/components/cards/SavedCardsTab';

export default function SavedCardsPage() {
  return (
    <main className="min-h-[100svh] w-full flex flex-col bg-[var(--t2m-paper)]">
      <header className="sticky top-0 z-50 flex h-14 items-center justify-between border-b border-[var(--t2m-line)] bg-[var(--t2m-paper)]/85 px-4 backdrop-blur-xl">
        <Link
          href="/drafts#enregistrees"
          className="text-[var(--t2m-ink-2)] hover:text-[var(--t2m-ink)] transition-colors inline-flex items-center gap-1.5 text-[13px]"
        >
          <ArrowLeft size={18} />
          Retour
        </Link>
        <h1 className="absolute left-1/2 -translate-x-1/2 text-[15px] font-medium tracking-tight text-[var(--t2m-ink)]">
          Cards enregistrées
        </h1>
        <span className="w-12" />
      </header>

      <div className="flex-1 overflow-y-auto pb-10">
        <SavedCardsTab />
      </div>
    </main>
  );
}
