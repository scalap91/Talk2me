'use client';
import MesListingsList from '@/components/create/MesListingsList';
import CreateServiceSheet from '@/components/create/CreateServiceSheet';

/** « Mes services » — miroir MyListingsScreen('service') natif (liste + bouton +). */
export default function MesServicesPage() {
  return (
    <MesListingsList
      title="Mes services"
      emoji="🔧"
      emptyText="Appuie sur + pour proposer un service (devis / prestation)."
      kind="service"
      Sheet={CreateServiceSheet}
    />
  );
}
