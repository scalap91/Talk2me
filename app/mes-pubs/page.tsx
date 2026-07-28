'use client';
import MesLibraryList from '@/components/create/MesLibraryList';

/** « Mes publicités » — miroir MyPubsScreen natif (bibliothèque variant=pub + bouton +). */
export default function MesPubsPage() {
  return (
    <MesLibraryList
      title="Mes publicités"
      emoji="📢"
      emptyText="Appuie sur + pour lancer une campagne (bannière / vidéo)."
      variant="pub"
      createHref="/creer/pub"
    />
  );
}
