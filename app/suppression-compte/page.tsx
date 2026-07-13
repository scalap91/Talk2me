/**
 * /suppression-compte — Page PUBLIQUE de demande de suppression de compte (exigée par
 * Google Play & Apple). Explique la suppression in-app (immédiate) + une voie e-mail
 * pour ceux qui n'ont plus accès à l'app. Aucune auth. (Pascal 2026-07-06)
 */
export const metadata = {
  title: 'Supprimer votre compte — Talk2Me',
  description: 'Comment supprimer votre compte Talk2Me et les données associées.',
};

export default function SuppressionComptePage() {
  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: '32px 20px', fontFamily: 'system-ui, sans-serif', color: '#2F343A', lineHeight: 1.6 }}>
      <h1 style={{ fontSize: 26, fontWeight: 800, marginBottom: 8 }}>Supprimer votre compte Talk2Me</h1>
      <p style={{ color: '#6A7585', marginBottom: 24 }}>
        Vous pouvez supprimer votre compte Talk2Me (<strong>com.talk2me.app</strong>) et toutes les données associées à tout moment, gratuitement.
      </p>

      <h2 style={{ fontSize: 18, fontWeight: 700, marginTop: 24 }}>Méthode 1 — Depuis l’application (immédiat)</h2>
      <ol style={{ paddingLeft: 20 }}>
        <li>Ouvrez l’application Talk2Me.</li>
        <li>Allez dans <strong>Profil</strong>.</li>
        <li>Touchez <strong>Supprimer mon compte</strong>.</li>
        <li>Confirmez. Votre compte et vos données sont supprimés immédiatement.</li>
      </ol>

      <h2 style={{ fontSize: 18, fontWeight: 700, marginTop: 24 }}>Méthode 2 — Sans accès à l’application</h2>
      <p>
        Si vous n’avez plus accès à l’application, envoyez une demande à{' '}
        <a href="mailto:support@talk2me.fr" style={{ color: '#FF7F11', fontWeight: 600 }}>support@talk2me.fr</a>{' '}
        depuis, ou en indiquant, le numéro de téléphone associé à votre compte. Nous traitons la demande sous <strong>30 jours maximum</strong>.
      </p>

      <h2 style={{ fontSize: 18, fontWeight: 700, marginTop: 24 }}>Données supprimées</h2>
      <p>
        La suppression efface définitivement : votre profil (numéro, nom, avatar), vos messages, vos publications et cards, vos boutiques et annonces, vos contacts et vos préférences. Aucune de ces données n’est conservée après suppression.
      </p>
      <p style={{ color: '#6A7585', fontSize: 14 }}>
        Seules peuvent être conservées, de façon limitée, les données strictement nécessaires à des obligations légales (par ex. facturation) lorsque la loi l’impose. Voir notre{' '}
        <a href="/legal/confidentialite" style={{ color: '#FF7F11' }}>politique de confidentialité</a>.
      </p>
    </main>
  );
}
