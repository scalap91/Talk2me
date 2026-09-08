/**
 * Layout commun des composers /creer/* (Pascal 2026-09-08) : fond CLAIR pleine hauteur.
 * Bug : les pages composer (ex. /creer/album) ne posaient aucun fond → le fond sombre de
 * l'app apparaissait derrière, titres « Créer / Retour / Pistes » illisibles sur noir.
 * Un seul endroit → corrige album, oeuvre, texte, etc. (parité avec le composer natif, clair).
 */
export default function CreerLayout({ children }: { children: React.ReactNode }) {
  return <div style={{ minHeight: '100dvh', background: '#fff' }}>{children}</div>;
}
