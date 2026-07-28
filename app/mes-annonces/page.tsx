import MesAnnoncesList from '@/components/create/MesAnnoncesList';

/**
 * « Mes annonces » — miroir MyAnnoncesScreen natif (liste + bouton + → DepositAnnonceSheet).
 * On exclut Immobilier & Véhicules : ils ont leurs écrans dédiés (/mes-immobilier, /mes-vehicules).
 */
export default function MesAnnoncesPage() {
  return (
    <MesAnnoncesList
      title="Mes annonces"
      emoji="🏷️"
      emptyText="Appuie sur + pour vendre ton premier objet."
      excludeCategories={['Immobilier', 'Véhicules']}
    />
  );
}
