/**
 * /schema/db-core — PLAN d'extraction du socle lib/db-core (Pascal 2026-06-30).
 * Prérequis à la démonolithisation des domaines couplés (messages/posts/users…).
 * Page interne (dev-only via schema/layout). Doc vivante — exécutée étape par
 * étape, validée à chaque palier.
 */
import Link from 'next/link';

export const dynamic = 'force-dynamic';

const card: React.CSSProperties = {
  background: '#11131a', border: '1px solid #232734', borderRadius: 14,
  padding: '16px 18px', margin: '14px 0',
};
const h2: React.CSSProperties = { fontSize: 18, fontWeight: 700, margin: '26px 0 6px', color: '#fff' };
const code: React.CSSProperties = {
  fontFamily: 'ui-monospace,Menlo,monospace', fontSize: 13, color: '#a8b3ff',
  background: '#0c0e14', padding: '2px 6px', borderRadius: 6,
};
const pre: React.CSSProperties = {
  fontFamily: 'ui-monospace,Menlo,monospace', fontSize: 12.5, color: '#cfd6e6',
  background: '#0c0e14', border: '1px solid #20242f', borderRadius: 10,
  padding: 14, overflowX: 'auto', lineHeight: 1.6, whiteSpace: 'pre',
};

export default function DbCorePlanPage() {
  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '20px 16px 80px', color: '#dde3ee' }}>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
        <Link href="/schema" style={{ color: '#8a93a8', fontSize: 14 }}>← Boussole</Link>
        <Link href="/schema/decoupage" style={{ color: '#8a93a8', fontSize: 14 }}>Découpage →</Link>
      </div>
      <h1 style={{ fontSize: 26, fontWeight: 800, color: '#fff', margin: '4px 0 2px' }}>
        Plan&nbsp;: socle <span style={code}>lib/db-core</span>
      </h1>
      <p style={{ color: '#9aa3b5', fontSize: 14, marginTop: 4 }}>
        La poutre en acier avant de scier le mur porteur. Découper le cœur de
        <span style={code}> lib/db.ts</span> (messages, posts, users…) est impossible
        en sécurité tant que les fonctions partagées (connexion, parsers, types)
        vivent dedans. On les sort d&apos;abord dans un <b>socle racine</b> dont tout
        le monde dépend, et qui ne dépend de personne.
      </p>

      <h2 style={h2}>Pourquoi (le piège à éviter)</h2>
      <div style={{ ...card, borderColor: '#5b2a2a', background: '#1a1112' }}>
        <p style={{ margin: 0, fontSize: 14 }}>
          ⚠️ Le build <b>ignore les erreurs TypeScript</b> (<span style={code}>ignoreBuildErrors:true</span>,
          hérité d&apos;un vieux split <span style={code}>lib/db/</span> abandonné). Donc un import
          oublié sur une section couplée <b>ne plante pas au build → mais au runtime</b>,
          en prod, sur le feed/chat/shop. Le socle <span style={code}>db-core</span> + un
          contrôle anti-régression (ci-dessous) neutralisent ce piège.
        </p>
      </div>

      <h2 style={h2}>Ce que contient le socle (cartographié dans db.ts)</h2>
      <div style={card}>
        <p style={{ marginTop: 0, fontSize: 14 }}>
          <b>Bonne nouvelle prouvée&nbsp;: la fondation est déjà contiguë en haut du
          fichier (lignes 1–1551).</b> Vérifié&nbsp;: l&apos;init est du <b>SQL pur</b> et
          la fondation n&apos;appelle <b>aucune</b> fonction de domaine définie plus bas
          (les 2 occurrences trouvées sont des commentaires). Cut net.
        </p>
        <ul style={{ fontSize: 14, lineHeight: 1.7, marginBottom: 0 }}>
          <li><b>Imports + constantes</b> (Database, randomUUID, <span style={code}>DB_PATH</span>) — l.1–41</li>
          <li><b>Types de cartes</b> <span style={code}>DbYoutube/DbPlace/DbRecipe/DbProduct/DbWikipedia/DbWeather/DbWebSearch/DbTiktok/DbMessageMedia</span> — l.42–157</li>
          <li><b><span style={code}>getDb()</span> + init du schéma</b> (tous les CREATE TABLE + migrations) — l.177–1200, <b>SQL pur</b></li>
          <li><b>Parsers partagés</b> <span style={code}>parseJsonArray, parseAttachedCards, parseMedia, parseTiktok, parseWebSearch, parseWikipedia, parseWeather, parseProducts, parseRecipe, parsePlaces, parseYoutube, parseUserRow</span> + type <span style={code}>DbUser</span> — l.1206–1551</li>
        </ul>
      </div>

      <h2 style={h2}>Architecture cible (DAG, plus de cycle)</h2>
      <pre style={pre}>{`        lib/db-core.ts   ← RACINE (getDb, types Db*, parsers)
          ▲      ▲              ne dépend de PERSONNE
          │      │
   lib/db.ts   lib/db-<domaine>.ts   (messages, posts, users…)
   (façade :     import { getDb, parse* } from '@/lib/db-core'
    export *     import { autreDomaine } from '@/lib/db'  (cross-call, runtime)
    from core
    + domaines
    restants)

  Les 199 appelants  ──import { … } from '@/lib/db'──▶  inchangés (façade)`}</pre>
      <p style={{ fontSize: 13.5, color: '#9aa3b5' }}>
        db-core ne dépend de rien → racine. db.ts et chaque domaine importent leurs
        primitives de db-core. Les appels <i>entre</i> domaines passent par la façade
        <span style={code}> @/lib/db</span> (résolus au runtime, donc les cycles éventuels
        sont sans danger — déjà le cas aujourd&apos;hui).
      </p>

      <h2 style={h2}>Étapes (chacune déployée + vérifiée avant la suivante)</h2>
      <div style={card}>
        <ol style={{ fontSize: 14, lineHeight: 1.8, paddingLeft: 20, margin: 0 }}>
          <li><b>Baseline anti-régression.</b> <span style={code}>npx tsc --noEmit</span> → enregistrer le nombre + la liste d&apos;erreurs AVANT. Toute <b>nouvelle</b> erreur «&nbsp;Cannot find name&nbsp;» après coup = un import oublié à corriger (le filet que le build n&apos;offre pas).</li>
          <li><b>Créer <span style={code}>lib/db-core.ts</span></b> = copie verbatim des lignes 1–1551 (imports + types cartes + getDb/init + parsers + DbUser). Aucun <span style={code}>import from &apos;@/lib/db&apos;</span> dedans (c&apos;est la racine).</li>
          <li><b>Vider la fondation de db.ts</b> et la remplacer par&nbsp;:
            <pre style={{ ...pre, marginTop: 8 }}>{`export * from './db-core';
import { getDb, parseJsonArray, parseUserRow,
  parseMedia, parseProducts, parsePlaces, parseRecipe,
  parseTiktok, parseWeather, parseWikipedia, parseWebSearch,
  parseYoutube, parseAttachedCards /* + types Db* utilisés */
} from './db-core';`}</pre>
            La liste exacte est <b>générée mécaniquement</b>&nbsp;: ce sont les exports de db-core encore référencés dans db.ts après la l.1551 (script de scan). Zéro deviné.
          </li>
          <li><b>Vérifier&nbsp;:</b> tsc (0 nouvelle erreur) → build → smoke runtime&nbsp;: <span style={code}>/home</span>, <span style={code}>/api/auth/me</span>, <span style={code}>/api/shop/store</span>, un message, une carte. Tout 200/redirect, rien en 500.</li>
          <li><b>Rapatrier les 6 modules déjà extraits</b> (db-tutorial/-drafts/-route-learnings/-memories/-habits/-saved-cards)&nbsp;: <span style={code}>import getDb from &apos;@/lib/db-core&apos;</span> au lieu de <span style={code}>@/lib/db</span> → supprime le dernier cycle. Optionnel, cosmétique.</li>
          <li><b>ALORS</b> les domaines couplés deviennent extractibles un par un&nbsp;: chacun importe ses primitives de <span style={code}>db-core</span> et ses cross-calls de la façade. Ordre conseillé&nbsp;: users → sessions → conversations → messages → posts → activities/jeux → commerce résiduel.</li>
        </ol>
      </div>

      <h2 style={h2}>Garde-fous (règles dures)</h2>
      <div style={card}>
        <ul style={{ fontSize: 14, lineHeight: 1.8, margin: 0 }}>
          <li>Le <b>schéma (CREATE TABLE)</b> reste UNIQUEMENT dans db-core (une seule init).</li>
          <li><b>Une étape = un déploiement = une vérif</b>. Jamais deux extractions sans contrôle entre.</li>
          <li>Avant toute extraction de domaine&nbsp;: <b>scan des dépendances croisées</b> (utilise / est-utilisé-par) — le build ne les attrape pas.</li>
          <li><b>Aucun changement de comportement</b>&nbsp;: on déplace du code, on n&apos;en réécrit pas. Mêmes symboles, même SQL.</li>
          <li>Les <b>199 appelants</b> (<span style={code}>from &apos;@/lib/db&apos;</span>) ne changent jamais — la façade garantit l&apos;iso-API.</li>
        </ul>
      </div>

      <h2 style={h2}>Pourquoi ça sert les millions d&apos;users</h2>
      <p style={{ fontSize: 14, color: '#9aa3b5' }}>
        Une fois les domaines isolés sur un socle commun, chaque domaine peut migrer
        vers <b>sa propre base</b> (Postgres) sur <b>son propre serveur</b> sans toucher
        aux autres&nbsp;: on remplace l&apos;implémentation d&apos;un module derrière son API
        stable. C&apos;est exactement le prérequis du tableau <Link href="/schema/decoupage" style={{ color: '#a8b3ff' }}>Découpage</Link>
        &nbsp;(1 module = 1 base = 1 serveur). Le socle, c&apos;est ce qui rend le découpage
        <i> possible sans rien casser</i>.
      </p>

      <p style={{ fontSize: 12.5, color: '#5e6675', marginTop: 30 }}>
        État au 2026-06-30&nbsp;: 6 sections propres déjà sorties (db.ts 8130→7283).
        db-core = prochaine étape, planifiée et prouvée faisable (cut net l.1–1551).
        Exécution sur validation explicite de Pascal.
      </p>
    </div>
  );
}
