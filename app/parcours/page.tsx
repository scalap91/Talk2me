/**
 * Talk2Me — /parcours : wrapper SERVEUR qui force le rendu dynamique (Pascal 2026-08-04).
 * La vue est un client component (ParcoursView). Sans ce wrapper, Next prérend la page en STATIQUE
 * avec Cache-Control s-maxage=1 an → le WebView garde une vieille version (les blocs gouvernance
 * n'apparaissent jamais). `dynamic='force-dynamic'` supprime ce cache figé.
 */
export const dynamic = 'force-dynamic';
import ParcoursView from './ParcoursView';

export default function ParcoursPage() {
  return <ParcoursView />;
}
