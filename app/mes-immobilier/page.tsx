import MesAnnoncesList from '@/components/create/MesAnnoncesList';

/** « Mes biens » — miroir MyImmoScreen natif (liste + bouton +, formulaire pré-réglé Immobilier). */
export default function MesImmobilierPage() {
  return (
    <MesAnnoncesList
      title="Mes biens"
      emoji="🏠"
      emptyText="Appuie sur + pour publier un bien à louer ou à vendre."
      includeCategories={['Immobilier']}
      presetCategory="Immobilier"
    />
  );
}
