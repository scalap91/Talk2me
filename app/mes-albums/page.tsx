'use client';
import MesLibraryList from '@/components/create/MesLibraryList';

/** « Mes albums » — miroir MyMediaScreen('album') natif (bibliothèque variant=album + bouton +). */
export default function MesAlbumsPage() {
  return (
    <MesLibraryList
      title="Mes albums"
      emoji="🎵"
      emptyText="Appuie sur + pour publier ta musique."
      variant="album"
      createHref="/creer/album"
    />
  );
}
