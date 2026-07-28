'use client';
import MesListingsList from '@/components/create/MesListingsList';
import CreateEmploiSheet from '@/components/create/CreateEmploiSheet';

/** « Mes offres d'emploi » — miroir MyListingsScreen('emploi') natif (liste + bouton +). */
export default function MesEmploiPage() {
  return (
    <MesListingsList
      title="Mes offres d’emploi"
      emoji="💼"
      emptyText="Appuie sur + pour proposer un job."
      kind="emploi"
      Sheet={CreateEmploiSheet}
    />
  );
}
