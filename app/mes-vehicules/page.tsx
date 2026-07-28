import MesAnnoncesList from '@/components/create/MesAnnoncesList';

/** « Mes véhicules » — miroir MyAutosScreen natif (liste + bouton +, formulaire pré-réglé Véhicules). */
export default function MesVehiculesPage() {
  return (
    <MesAnnoncesList
      title="Mes véhicules"
      emoji="🚗"
      emptyText="Appuie sur + pour vendre ou louer un véhicule."
      includeCategories={['Véhicules']}
      presetCategory="Véhicules"
    />
  );
}
