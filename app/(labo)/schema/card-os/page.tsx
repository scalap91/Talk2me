/**
 * /schema/card-os — CONTRAT DE LA SUPERCARD (doctrine fondatrice, Pascal 2026-06-30).
 * UNE seule SuperCard = objet métier universel + source de vérité. Tous les écrans
 * (Feed, Eat, Boutique, Annonces, Recherche, Profils, Carte, IA) sont des LECTEURS :
 * ils lisent la MÊME card et révèlent les facettes qu'ils veulent. On enrichit la card
 * au centre → les lecteurs n'ont rien à changer. Page interne (dev-only via layout).
 * Document GELÉ — référence vivante. Implémentation = étapes suivantes, validées une à une.
 */
import Link from 'next/link';

export const dynamic = 'force-dynamic';

const CONTRACT = `// Esquisse du contrat — UNE seule card, plein d'outils dedans (tous optionnels).
interface SuperCard {
  // — Identité (socle)
  id: string;              // ID mondial unique
  types: CardType[];       // une card PEUT cumuler : ['product','video'] etc.
  channel?: 'eat' | 'annonce' | 'boutique'; // SWITCH commerce : lecteur + libellé paiement
  owner: string;           // user / entreprise (sert aussi à l'affiliation)
  version: number;
  createdAt: number; updatedAt: number;
  state: 'draft' | 'published' | 'archived';
  signature?: string;      // arc long : confiance native (.card vérifiable)

  // — Boîte à outils (facettes ; le LECTEUR choisit ce qu'il révèle)
  text?:   { title?: string; body?: string };
  image?:  { url: string }[]; // galerie / carrousel
  video?:  { url?: string; embed?: string };      // natif ou YouTube/TikTok…
  audio?:  { embed?: string };                    // Spotify / YouTube
  link?:   { url: string; reader?: 'inline' | 'embed' | 'preview' };
  doc?:    { url: string; kind: 'pdf' | 'file' };
  place?:  { lat: number; lng: number; address?: string };
  price?:  { amount?: number; currency?: string; variants?: any[] }; // MÊME rayon : produit / annonce / plat
  specs?:  Record<string, string>; // UNIVERSEL : { "Taille":"M", "Marque":"Toyota", "Année":"2018" }
  deposit?: { amount?: number; currency?: string }; // caution/acompte — PARTAGÉ (escrow)
  stock?:  number;                                   // quantité — PARTAGÉ (annonce/boutique)
  rating?: { score?: number; count?: number };

  // — Découverte (Recherche + IA)
  categories?: string[]; keywords?: string[];

  // — Contrat d'interaction (ce qu'on peut FAIRE)
  actions?: CardAction[];  // buy, reserve, order, contact, route, apply, save, share…
  api?:     { provider?: string; endpoint?: string; auth?: string }; // BigBuy/Stripe/Booking…

  // — Gouvernance
  permissions?: { visibility: 'public' | 'friends' | 'private' };
  affiliation?: { ownerCut?: number };
  analytics?:   { views?: number; clicks?: number; conversions?: number };
  validation?:  { visionChecked?: boolean }; // image cohérente avant publish
}

// Le LECTEUR ne décide qu'une chose : COMMENT il lit la même card.
interface ReadProfile {
  reader: 'feed' | 'eat' | 'boutique' | 'annonces' | 'search' | 'profile' | 'map' | 'ai';
  level: 'mini' | 'normal' | 'full' | 'inline';
  reveal: (keyof SuperCard)[]; // quelles facettes montrer
  actions?: CardActionKind[];   // quelles actions exposer
}`;

const READERS: [string, string, string][] = [
  ['📰 Feed', 'mini', 'image + titre + 1 ligne'],
  ['🍽️ Eat', 'full', 'menu + horaires + « Réserver »'],
  ['🛍️ Boutique', 'normal', 'produit + prix + « Acheter » (API BigBuy)'],
  ['🏷️ Annonces', 'normal', 'photos + prix + « Contacter »'],
  ['🔎 Recherche', 'mini', 'titre + catégorie + mots-clés'],
  ['🗺️ Carte', 'mini', 'point + « Itinéraire »'],
  ['👤 Profil', 'normal', 'toutes les cards du propriétaire'],
  ['🤖 IA (Léa)', 'variable', 'lit + interprète + déclenche l’action'],
];

function Sec({ title, children, tone }: { title: string; children: React.ReactNode; tone?: string }) {
  return (
    <section className={'rounded-2xl border p-4 ' + (tone || 'border-white/10 bg-white/[0.03]')}>
      <h2 className="text-[13px] uppercase tracking-wider text-white/45 mb-3">{title}</h2>
      {children}
    </section>
  );
}

export default function CardOsPage() {
  return (
    <main className="min-h-[100svh] w-full bg-[#0e0e12] text-white">
      <header className="sticky top-0 z-40 border-b border-white/8 bg-[#0e0e12]/85 backdrop-blur-xl">
        <div className="mx-auto max-w-3xl px-4 h-14 flex items-center justify-between">
          <Link href="/schema" className="text-white/55 hover:text-white/90 text-[13px]">← Boussole</Link>
          <h1 className="text-[15px] font-medium">Card OS — le contrat</h1>
          <div className="flex gap-3">
            <Link href="/schema/card-os/feed" className="text-emerald-300/90 hover:text-emerald-200 text-[13px]">Feed réel →</Link>
            <Link href="/schema/card-os/lecteurs" className="text-fuchsia-300/90 hover:text-fuchsia-200 text-[13px]">Lecteurs →</Link>
            <Link href="/schema/card-os/demo" className="text-fuchsia-300/90 hover:text-fuchsia-200 text-[13px]">Moteur →</Link>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-4 py-8 space-y-5">
        <p className="rounded-2xl border border-violet-400/25 bg-violet-500/[0.07] p-4 text-[13.5px] text-white/85 leading-relaxed">
          <b>Doctrine fondatrice (Pascal 2026-06-30).</b> On arrête de construire des modules-applications.
          On construit <b>un système d’exploitation de Cards</b>. Il existe <b>UNE seule SuperCard</b> :
          un objet riche, source de vérité unique, créé une fois, avec un ID mondial. Tous les écrans
          (Feed, Eat, Boutique, Annonces, Recherche, Profils, Carte, IA) sont des <b>lecteurs</b> :
          ils lisent la <b>même</b> card et <b>révèlent les facettes qu’ils veulent</b>.
        </p>

        {/* MANIFESTE C.A.R.D. — la Card n'est pas une fiche, c'est un protocole d'interaction. */}
        <div className="rounded-2xl border border-cyan-400/25 bg-cyan-500/[0.06] p-4">
          <p className="text-[13.5px] text-white/85 leading-relaxed">
            <b>La Card n’est pas un composant graphique. C’est le PROTOCOLE D’INTERACTION universel de T2M.</b>{' '}
            On ne construit plus une plateforme de <i>publications</i> — on construit un écosystème <b>d’objets interactifs</b>.
            Chaque Card = <b>une opportunité</b>.
          </p>
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {[
              ['C — Connect / Connecter', 'Point d’entrée universel vers une entité (entreprise, user, produit, service, annonce, événement) → connectée à tout l’écosystème.', 'owner · channel · api · link'],
              ['A — Act / Agir', 'Pas faite pour être consultée : faite pour AGIR tout de suite. Acheter, réserver, commander, appeler, payer, postuler, regarder…', 'actions[] · rail de paiement unique'],
              ['R — Route / Orienter', 'Le Hub + l’IA comprennent une INTENTION et dirigent vers la bonne Card puis la bonne action. Le Hub ne cherche pas, il oriente.', 'readers.accepts · intent → card → action'],
              ['D — Discover / Découvrir', 'Feed, Recherche, reco, Carte, Profils, IA : tous font découvrir des opportunités via les Cards.', 'lecteurs feed/search/map/profile'],
            ].map(([t, d, tech]) => (
              <div key={t} className="rounded-xl bg-black/25 border border-white/10 p-3">
                <div className="text-[13px] font-semibold text-cyan-200">{t}</div>
                <div className="text-[12px] text-white/70 mt-1 leading-snug">{d}</div>
                <div className="text-[10.5px] text-white/40 mt-1.5 font-mono">{tech}</div>
              </div>
            ))}
          </div>
          <p className="text-[12px] text-cyan-100/80 mt-3 leading-relaxed">
            Le Hub les orchestre · l’IA les comprend · les lecteurs les révèlent · <b>les utilisateurs agissent.</b>{' '}
            <b>Connect • Act • Route • Discover.</b>
          </p>
        </div>

        <Sec title="Le principe (couteau suisse 🔪)">
          <p className="text-[13px] text-white/75 leading-relaxed">
            Une seule card, plein d’outils dedans. On n’ouvre pas un autre couteau pour couper :
            le lecteur <b>sort la lame qu’il lui faut</b>. La « petite card » d’avant (VideoCard, ProductCard…)
            n’est plus un objet à part — c’est juste <b>une vue</b> de l’unique SuperCard.
          </p>
          <p className="text-[12px] text-white/50 mt-2">
            👉 Conséquence directe : <b>fini les codes d’affichage superposés</b>. Un seul moteur de rendu →
            plus de bugs de cards qui se chevauchent dans le Feed.
          </p>
        </Sec>

        <Sec title="L'objet unique — esquisse du contrat (.card)">
          <pre className="text-[11.5px] leading-relaxed text-[#cfd6e6] bg-[#0c0e14] border border-white/10 rounded-xl p-3 overflow-x-auto whitespace-pre">{CONTRACT}</pre>
          <p className="text-[11px] text-white/40 mt-2">Toutes les facettes sont <b>optionnelles</b>. Une card peut être à la fois produit + vidéo + géoloc. Le lecteur choisit.</p>
        </Sec>

        <Sec title="Scalable : 1 rayon par info + 1 switch (zéro doublon)" tone="border-emerald-400/25 bg-emerald-500/[0.06]">
          <p className="text-[13px] text-white/80 leading-relaxed">
            <b>Pas de tiroir « boutique » + tiroir « annonce » + tiroir « eat ».</b> Ça ferait 3 fois les mêmes champs.
            À la place : <b>UN seul jeu de rayons partagés</b> (tous optionnels).
          </p>
          <ul className="text-[13px] text-white/80 space-y-1.5 list-disc pl-5 mt-2">
            <li>Le <b>prix</b> d’un produit, d’une annonce ou d’un plat → <b>le même rayon <code>price</code></b>. Pas trois.</li>
            <li>La <b>description</b> d’une robe ou d’un plat → <b>le même rayon <code>text</code></b>. L’emplacement ne bouge jamais.</li>
            <li>Les attributs spécifiques (taille, marque, surface…) → <b>un rayon universel <code>specs</code></b> (clé→valeur), valable pour TOUS les types.</li>
          </ul>
          <p className="text-[13px] text-white/80 leading-relaxed mt-2">
            Le <b>switch</b> = le rayon <code>types</code> (<code>product</code> / <code>listing</code> / <code>restaurant</code>…).
            Il dit ce que la card <b>est</b> → change le <b>lecteur</b> et l’<b>étiquette du bouton</b>, <b>jamais l’emplacement</b> de la donnée.
          </p>
          <p className="text-[12px] text-emerald-200/90 leading-relaxed mt-2">
            👉 <b>Paiement câblé UNE seule fois.</b> Le rail lit <code>price</code> + l’<code>action</code> (buy / reserve / order) de
            n’importe quelle card → encaisse. Boutique, Annonce, Eat partagent le même rail ; le switch ne change que le libellé.
            <br />Analogie : <b>un seul TPE au comptoir</b> — pain, voiture ou repas, il lit « montant + opération » et encaisse. Pas trois TPE.
          </p>
        </Sec>

        <Sec title="La lecture — chaque écran lit la MÊME card à sa manière">
          <div className="overflow-x-auto rounded-xl border border-white/10">
            <table className="w-full text-[12px]">
              <thead className="bg-white/[0.04] text-white/55"><tr>
                <th className="text-left px-3 py-2">Lecteur</th><th className="text-left px-3 py-2">Niveau</th><th className="text-left px-3 py-2">Ce qu’il révèle</th>
              </tr></thead>
              <tbody>
                {READERS.map(([r, lvl, rev]) => (
                  <tr key={r} className="border-t border-white/8">
                    <td className="px-3 py-2 font-medium text-white/85">{r}</td>
                    <td className="px-3 py-2 text-white/55"><code>{lvl}</code></td>
                    <td className="px-3 py-2 text-white/70">{rev}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[12px] text-white/50 mt-2">
            <b className="text-white/70">On enrichit la card au centre</b> (nouvelle facette / nouvelle action) →
            <b> tous les lecteurs en profitent sans qu’on y touche.</b>
          </p>
        </Sec>

        <Sec title="La création — TOUT passe par la Card">
          <ul className="text-[13px] text-white/80 space-y-1.5 list-disc pl-5">
            <li>Créer une <b>boutique</b> = créer des Cards produit en arrière-plan.</li>
            <li>Écrire un <b>article</b> / poster une <b>annonce</b> / une <b>story</b> = créer une Card.</li>
            <li>Une <b>entreprise attache une Card à son service</b> (elle décrit + lie son API).</li>
            <li><b>Un seul éditeur Card</b> remplace à terme les éditeurs séparés (Video / Image / Product…).</li>
          </ul>
        </Sec>

        <Sec title="API optionnelle · identité · ambition .card (arc long)">
          <p className="text-[13px] text-white/75 leading-relaxed">
            <b>La Card décrit, l’API agit.</b> Une entreprise existe avec une simple Card ; l’API (paiement,
            réservation, stock) ne sert que pour <b>exécuter</b>. La card porte son <code>api</code> connectée
            (ex. produit BigBuy + endpoint de commande). À terme : <b>ID mondial + version + signature</b> →
            confiance native, et un format <code>.card</code> lisible par <b>n’importe quelle IA / plateforme</b>
            (comme le PDF pour le document). On le <b>conçoit</b> dès maintenant, on ne le <b>construit</b> pas en premier.
          </p>
        </Sec>

        <Sec title="Complémentaire, pas remplaçant">
          <p className="text-[13px] text-white/75 leading-relaxed">
            On ne refait pas YouTube / Spotify / Booking / Amazon / Google. Ils hébergent ; nous ajoutons
            la <b>couche conversationnelle</b> : le Hub comprend l’intention → retrouve les bonnes Cards →
            les affiche → dispatche vers l’action. <b>Google indexe des pages ; T2M indexe des Cards et répond par des actions.</b>
          </p>
        </Sec>

        <Sec title="Comment on migre SANS casser (discipline)" tone="border-amber-400/25 bg-amber-500/[0.06]">
          <ol className="text-[13px] text-amber-100/85 space-y-1.5 list-decimal pl-5">
            <li><b>Geler le contrat</b> (cette page) — fait. Pierre angulaire, zéro risque.</li>
            <li><b>Façade Card</b> au-dessus de l’existant (posts / direct_cards / produits / annonces exposés comme SuperCard) — sans rien migrer, comme la façade qui a marché pour <code>db.ts</code>.</li>
            <li><b>Le moteur SuperCard</b> (un seul rendu) + le <b>profil de lecture</b>.</li>
            <li>Brancher <b>UN lecteur</b> (le Feed) pour prouver — sans toucher aux autres.</li>
            <li>Migrer les autres lecteurs <b>un par un</b>, validés. Jamais de big-bang sur le Feed/Shop/Chat vivants.</li>
          </ol>
        </Sec>

        <p className="text-[11px] text-white/30">Contrat gelé le 2026-06-30. Référence vivante — toute évolution de la Card part d’ici.</p>
      </div>
    </main>
  );
}
