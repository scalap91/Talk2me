'use client';
import MesLibraryList from '@/components/create/MesLibraryList';

/** « Mes films » — miroir MyMediaScreen('film') natif (bibliothèque variant=film + bouton +). */
export default function MesFilmsPage() {
  return (
    <MesLibraryList
      title="Mes films"
      emoji="🎬"
      emptyText="Appuie sur + pour créer un film (en projet ou à vendre)."
      variant="film"
      createHref="/creer/oeuvre"
    />
  );
}
