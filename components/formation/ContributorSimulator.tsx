'use client';
/**
 * SIMULATEUR — « L'économie du contributeur » (Pascal 2026-07-28, d'après SON artifact de référence,
 * RÉÉCRIT en vrai React — aucun iframe/URL). Thème BLANC (comme tout le reste).
 *
 * `pages` : dans la formation (deck), le simulateur est DÉCOUPÉ en plusieurs PAGES qui se glissent —
 * chaque morceau tient dans UN écran : 1) ce que tu gagnes · 2) ton portefeuille · 3) les taux ·
 * 4) le flux financier · 5) pour vivre · 6) la pub. État PARTAGÉ (un seul composant). Sinon (page
 * /formation) : tout empilé normalement.
 *
 * Modèle : chaque ACTIVITÉ se règle (commerces × ventes/jour × panier × jours = CA/mois). Commission
 * 3 % = 2 % plateforme + 1 % référent ; override remonte une part du 1 % aux parrains. Pub = flux à
 * part (10 % au contributeur qui a amené l'annonceur). En Ariary.
 */
import { useMemo, useState } from 'react';

const SMIG = 250000;
const fmt = (n: number) => Math.round(n).toLocaleString('fr-FR');
// Thème SOMBRE (immersif — Pascal 2026-07-28 « laisse en noir c'est immersif »).
const INK = '#F4F5F7', MUT = '#9AA0A8', FAINT = '#6E7480', LINE = '#2A2D33', ACC = '#FF9A3D', GOOD = '#3DD68C', BLUE = '#5AA0E8';
const PANE = '#0b0c10', CARDBG = '#1B1D21';
const card: React.CSSProperties = { background: CARDBG, border: `1px solid ${LINE}`, borderRadius: 16, boxShadow: '0 1px 2px rgba(0,0,0,.3),0 8px 24px rgba(0,0,0,.35)' };
const eyebrow: React.CSSProperties = { fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase', color: MUT, fontWeight: 800, marginBottom: 10 };

interface Row { key: string; emoji: string; label: string; comm: number; vpj: number; panier: number }
// Défaut = l'exemple de l'accroche (3 restos, 3 boutiques, 2 plats maison). Annonces/Services/Livraison
// à 0 = ce que le contributeur AJOUTE pour gagner plus (montre la marge de progression).
const DEFAULT: Row[] = [
  { key: 'resto', emoji: '🍽️', label: 'Restaurants', comm: 3, vpj: 15, panier: 25000 },
  { key: 'boutique', emoji: '🛍️', label: 'Boutiques', comm: 3, vpj: 10, panier: 30000 },
  { key: 'plats', emoji: '🍲', label: 'Plats maison', comm: 2, vpj: 6, panier: 8000 },
  { key: 'annonces', emoji: '🏷️', label: 'Annonces', comm: 0, vpj: 1, panier: 50000 },
  { key: 'services', emoji: '🔧', label: 'Services', comm: 0, vpj: 2, panier: 40000 },
  { key: 'livraison', emoji: '🛵', label: 'Livraison', comm: 0, vpj: 20, panier: 5000 },
];

function Num({ value, onChange, min, max, w = 64 }: { value: number; onChange: (v: number) => void; min: number; max: number; w?: number }) {
  return <input type="number" value={value} min={min} max={max}
    onChange={(e) => { const v = Number(e.target.value); onChange(Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : min); }}
    style={{ width: w, background: '#0f1013', border: `1px solid ${LINE}`, borderRadius: 8, color: INK, fontSize: 13, fontWeight: 700, padding: '6px 8px', textAlign: 'center', fontVariantNumeric: 'tabular-nums', outline: 'none' }} />;
}
function Slider({ label, value, min, max, step, onChange, fmtVal }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; fmtVal: (v: number) => string }) {
  const p = ((value - min) / (max - min)) * 100;
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontSize: 13.5, fontWeight: 600, color: INK }}>{label}</span>
        <span style={{ fontWeight: 800, color: ACC, fontSize: 14.5, fontVariantNumeric: 'tabular-nums' }}>{fmtVal(value)}</span>
      </div>
      <input type="range" value={value} min={min} max={max} step={step} onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: '100%', height: 6, borderRadius: 99, appearance: 'none', WebkitAppearance: 'none', outline: 'none', background: `linear-gradient(to right,${ACC} ${p}%,${LINE} ${p}%)` }} />
    </div>
  );
}

// TAUX FIXÉS PAR TALK2ME — identiques pour TOUS. Le contributeur ne les choisit PAS (sinon il s'augmenterait
// lui-même = absurde). Il ne règle QUE ce qu'il contrôle : ses commerces + ses jours actifs. (Pascal 2026-07-28)
const DISTR = 1;   // % de commission qui te revient (référent)
const PLAT = 2;    // % plateforme
const OV = 15;     // % de ton 1% qui remonte à tes parrains
const PUB_TOI = 10; // % du prix d'une pub qui te revient (apport)

export default function ContributorSimulator({ pages = false }: { pages?: boolean }) {
  const [rows, setRows] = useState<Row[]>(DEFAULT.map((r) => ({ ...r })));
  const [jours, setJours] = useState(26);
  const [pub, setPub] = useState(200000);
  const distr = DISTR, plat = PLAT, ov = OV;
  const set = (i: number, k: keyof Row, v: number) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, [k]: v } : r)));

  const r = useMemo(() => {
    const per = rows.map((x) => {
      const caOne = x.vpj * x.panier * jours;
      const toiOne = caOne * (distr / 100) * (1 - ov / 100);
      return { ...x, ca: x.comm * caOne, caOne, toiOne, pourVivre: toiOne > 0 ? Math.ceil(SMIG / toiOne) : 0 };
    });
    const totalCA = per.reduce((s, x) => s + x.ca, 0), totalComm = per.reduce((s, x) => s + x.comm, 0);
    const refGross = totalCA * distr / 100, overrideTot = refGross * ov / 100, refNet = refGross - overrideTot;
    const parrain = overrideTot * 0.67, grandP = overrideTot * 0.33, platTot = totalCA * plat / 100;
    const pubToi = pub * 0.10, pubPlat = pub * 0.90;
    // Résumé DYNAMIQUE du portefeuille (« 3 restaurants, 3 boutiques et 2 plats maison ») — bouge en direct.
    const parts = per.filter((x) => x.comm > 0).map((x) => `${x.comm} ${x.label.toLowerCase()}`);
    const summary = parts.length === 0 ? 'aucun commerce' : parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} et ${parts[parts.length - 1]}`;
    return { per, totalCA, totalComm, refGross, refNet, parrain, grandP, platTot, smigMult: refGross / SMIG, pubToi, pubPlat, total: refNet + pubToi, summary };
  }, [rows, jours, distr, plat, ov, pub]);
  const above = r.refGross >= SMIG;

  // Enveloppe de section : PAGE plein écran blanche (deck) ou bloc empilé (page /formation).
  // Page centrée verticalement (« safe center » = centré si ça tient, sinon aligné en haut sans rogner).
  const Sec = ({ children }: { children: React.ReactNode }) => pages
    ? <div className="shrink-0 basis-full snap-center snap-always overflow-y-auto" style={{ height: '100%', background: PANE, color: INK, display: 'flex', flexDirection: 'column', justifyContent: 'safe center' }}><div style={{ padding: 'calc(env(safe-area-inset-top) + 72px) 16px calc(env(safe-area-inset-bottom) + 96px)', maxWidth: 560, width: '100%', marginLeft: 'auto', marginRight: 'auto' }}>{children}</div></div>
    : <div style={{ marginBottom: 14 }}>{children}</div>;

  // INTRO (Pascal) : d'abord POURQUOI on cherche des contributeurs + CE QU'ILS FONT, ENSUITE le tableau.
  const P_intro = (
    <Sec key="i">
      <div style={eyebrow}>Pourquoi on a besoin de toi</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: INK, lineHeight: 1.3, marginBottom: 14 }}>Un commerce ne se met pas en ligne tout seul. Il faut quelqu'un sur le terrain — <span style={{ color: ACC }}>toi</span>.</div>
      <div style={{ fontSize: 14.5, color: MUT, lineHeight: 1.65 }}>
        Tu connais ta zone et les gens. <b style={{ color: INK }}>Ton rôle :</b> faire entrer les commerces de ton quartier dans Talk2Me — restos, boutiques, plats maison, transport, services — les <b style={{ color: INK }}>aider à vendre</b> et les faire connaître.
        <div style={{ height: 12 }} />
        En échange, tu touches une <b style={{ color: GOOD }}>commission sur leurs vraies ventes</b>, chaque mois, tant que tu les sers.
        <div style={{ height: 12 }} />
        Et tu peux aller plus loin : <b style={{ color: INK }}>invite d'autres contributeurs comme toi</b> — tu gagnes aussi une part sur leur activité. <b style={{ color: ACC }}>Monte ton équipe, donne-lui un nom, et lance-toi.</b>
        <div style={{ height: 12 }} />
        Voici ce que ça peut te rapporter 👇
      </div>
    </Sec>
  );
  // DÉTAIL du geste par activité (Pascal) : ce que le contributeur fait concrètement pour chaque type.
  const actDetail: [string, string, React.ReactNode][] = [
    ['🍽️', 'Restaurant', <>tu crées sa fiche et <b style={{ color: INK }}>son menu</b> (ses plats en photo, les prix).</>],
    ['🛍️', 'Boutique', <>tu la fais connaître et tu l'aides à <b style={{ color: INK }}>rentrer ses premiers articles</b> — ensuite elle se débrouille… ou garde besoin de toi.</>],
    ['🍲', 'Plat maison', <>la mama qui cuisine chez elle : tu crées sa fiche et <b style={{ color: INK }}>ses plats du jour</b>.</>],
    ['🔧', 'Service', <>le menuisier, le plombier de ton quartier : tu fais sa <b style={{ color: INK }}>fiche bien claire</b> (photos, tarifs).</>],
    ['🏷️', 'Annonce', <>tu aides les gens à <b style={{ color: INK }}>vendre leurs objets</b> (belle photo + fiche nette).</>],
    ['🛵', 'Livraison', <>tu <b style={{ color: INK }}>parraines les tuk-tuk et livreurs</b> de ta zone : tu gagnes sur chacune de leurs courses.</>],
  ];
  const P_activities = (
    <Sec key="act">
      <div style={eyebrow}>Concrètement, ce que tu fais</div>
      <div style={{ fontSize: 13.5, color: MUT, marginBottom: 14, lineHeight: 1.5 }}>Tu <b style={{ color: INK }}>amorces</b> chaque commerce de ta zone — et souvent, ils garderont besoin de toi.</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {actDetail.map(([e, name, desc]) => (
          <div key={name} style={{ display: 'flex', gap: 10 }}>
            <span style={{ fontSize: 22, lineHeight: 1 }}>{e}</span>
            <div style={{ fontSize: 13.5, color: MUT, lineHeight: 1.45 }}><b style={{ color: INK }}>{name}</b> — {desc}</div>
          </div>
        ))}
      </div>
      {/* SUSPENSE (Pascal) : on annonce le scénario (dynamique) + « tu peux gagner… » ; le MONTANT est révélé
          la page d'après. Le résumé bouge quand on règle le portefeuille. */}
      <div style={{ ...card, padding: 16, marginTop: 18, borderColor: ACC, background: 'linear-gradient(180deg,rgba(255,127,17,.12),transparent 80%)' }}>
        <div style={{ fontSize: 14.5, color: INK, lineHeight: 1.5 }}>Avec <b style={{ color: ACC }}>{r.summary}</b> de ta zone, tu peux gagner…</div>
        <div style={{ fontSize: 13, color: MUT, marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 6 }}>glisse pour voir combien <span style={{ fontSize: 16 }}>👉</span></div>
      </div>
    </Sec>
  );
  const P_result = (
    <Sec key="r">
      <div style={eyebrow}>🧮 Ce que tu peux gagner</div>
      <div style={{ fontSize: 14, color: INK, marginBottom: 14, lineHeight: 1.5 }}>Avec <b style={{ color: ACC }}>{r.summary}</b> de ta zone :</div>
      <div style={{ ...card, padding: 18, border: `1px solid ${ACC}`, background: 'linear-gradient(180deg,rgba(255,127,17,.12),transparent 70%)', marginBottom: 12 }}>
        <div style={{ fontSize: 12, color: MUT, fontWeight: 600 }}>🧑‍🌾 Ta commission de référent</div>
        <div style={{ fontVariantNumeric: 'tabular-nums', fontSize: 33, fontWeight: 800, letterSpacing: '-.02em', margin: '6px 0 2px', color: INK }}>{fmt(r.refGross)} Ar</div>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 800, padding: '3px 10px', borderRadius: 99, background: above ? 'rgba(18,183,106,.12)' : 'rgba(255,127,17,.12)', color: above ? GOOD : ACC }}>{above ? `✓ ×${r.smigMult.toFixed(1).replace('.', ',')} le SMIG` : `${Math.round(r.smigMult * 100)} % du SMIG`}</span>
        <div style={{ fontSize: 12.5, color: MUT, marginTop: 8 }}>sur {r.totalComm} commerces servis</div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div style={{ ...card, padding: 14 }}><div style={{ fontSize: 11.5, color: MUT, fontWeight: 600 }}>🏛️ Notre part (plateforme)</div><div style={{ fontVariantNumeric: 'tabular-nums', fontSize: 19, fontWeight: 800, marginTop: 4 }}>{fmt(r.platTot)} Ar</div></div>
        <div style={{ ...card, padding: 14 }}><div style={{ fontSize: 11.5, color: MUT, fontWeight: 600 }}>💰 Ton total (comm. + pub)</div><div style={{ fontVariantNumeric: 'tabular-nums', fontSize: 19, fontWeight: 800, marginTop: 4, color: GOOD }}>{fmt(r.total)} Ar</div></div>
      </div>
      <div style={{ fontSize: 12.5, color: MUT, marginTop: 12, lineHeight: 1.5 }}>Bouge tes activités et les taux dans les pages suivantes → ce montant se met à jour. C'est un <b style={{ color: INK }}>plancher</b> (ton propre commerce et la prime d'apport ne sont pas comptés).</div>
    </Sec>
  );

  const P_portfolio = (
    <Sec key="p">
      <div style={eyebrow}>Ton portefeuille · activité par activité</div>
      <div style={{ fontSize: 12.5, color: MUT, marginBottom: 12 }}>Règle chaque ligne à ta réalité : commerces, ventes/jour, panier.</div>
      {r.per.map((x, i) => (
        <div key={x.key} style={{ padding: '6px 0', borderTop: i ? `1px solid ${LINE}` : 'none' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5 }}>
            <span style={{ fontSize: 13.5, fontWeight: 700 }}>{x.emoji} {x.label}</span>
            <span style={{ fontSize: 13, fontWeight: 800, color: GOOD, fontVariantNumeric: 'tabular-nums' }}>+{fmt(x.toiOne * x.comm)} Ar</span>
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <label style={{ fontSize: 10.5, color: MUT }}>Comm <Num value={x.comm} min={0} max={200} w={44} onChange={(v) => set(i, 'comm', v)} /></label>
            <label style={{ fontSize: 10.5, color: MUT }}>V/j <Num value={x.vpj} min={0} max={500} w={48} onChange={(v) => set(i, 'vpj', v)} /></label>
            <label style={{ fontSize: 10.5, color: MUT }}>Panier <Num value={x.panier} min={0} max={2000000} w={74} onChange={(v) => set(i, 'panier', v)} /></label>
          </div>
        </div>
      ))}
      <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: `2px solid ${ACC}`, marginTop: 8, paddingTop: 8, fontSize: 13.5, fontWeight: 800 }}>
        <span>Total · {r.totalComm} commerces</span><span style={{ color: ACC, fontVariantNumeric: 'tabular-nums' }}>{fmt(r.totalCA)} Ar/mois</span>
      </div>
      <div style={{ marginTop: 12 }}><Slider label="Jours actifs par mois" value={jours} min={1} max={31} step={1} onChange={setJours} fmtVal={(v) => `${v}`} /></div>
    </Sec>
  );

  const rateRow = (label: string, val: string, good?: boolean) => (
    <div style={{ ...card, padding: '13px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ fontSize: 13.5 }}>{label}</span><b style={{ fontSize: 17, color: good ? GOOD : INK, fontVariantNumeric: 'tabular-nums' }}>{val}</b>
    </div>
  );
  const P_rates = (
    <Sec key="t">
      <div style={eyebrow}>Comment ça se partage — fixé par Talk2Me</div>
      <div style={{ fontSize: 13, color: MUT, marginBottom: 14, lineHeight: 1.5 }}>Ces taux sont les <b style={{ color: INK }}>mêmes pour tout le monde</b>. Tu ne les choisis pas, tu ne peux pas t'augmenter. Ce que TU règles, c'est <b style={{ color: INK }}>ton portefeuille de commerces</b> — le reste est écrit dans le marbre.</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {rateRow('🧑‍🌾 Toi, le référent', '1 %', true)}
        {rateRow('🏛️ La plateforme', '2 %')}
        {rateRow('👍 Tes parrains — sur ton 1 %', '15 %')}
        {rateRow('📢 Toi, sur une pub que tu amènes', '10 %', true)}
      </div>
      <div style={{ fontSize: 12.5, color: MUT, marginTop: 14, lineHeight: 1.5 }}>Commission totale = <b style={{ color: INK }}>3 % par vente</b> (2 % plateforme + 1 % pour toi). L'override (15 % de ton 1 %) récompense ceux qui t'ont formé et recruté.</div>
    </Sec>
  );

  const P_flux = (
    <Sec key="f">
      <div style={eyebrow}>🌳 Le flux financier — de l'activité aux wallets</div>
      <div style={{ textAlign: 'center' }}>
        <div style={{ display: 'inline-block', background: 'rgba(255,127,17,.12)', border: `1px solid ${ACC}`, borderRadius: 10, padding: '8px 14px', fontSize: 13 }}>Total activités<br /><b style={{ fontSize: 16 }}>{fmt(r.totalCA)}</b> Ar de ventes / mois</div>
        <div style={{ fontSize: 11, color: FAINT, padding: '6px 0' }}>↓ 3 % de commission</div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div style={{ ...card, padding: '8px 12px', fontSize: 12.5 }}>🏛️ Plateforme · 2 %<br /><b style={{ fontSize: 14, color: MUT }}>{fmt(r.platTot)}</b> Ar → 🪙</div>
          <div>
            <div style={{ background: 'rgba(255,127,17,.12)', border: `1px solid ${LINE}`, borderRadius: 10, padding: '6px 12px', fontSize: 12.5, fontWeight: 700 }}>1 % distribué</div>
            <div style={{ fontSize: 11, color: FAINT, padding: '5px 0' }}>↓ remonte l'arbre des parrains</div>
            <div style={{ display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap' }}>
              <div style={{ ...card, padding: '7px 10px', fontSize: 11.5 }}><span style={{ color: MUT }}>🧑‍🌾 Toi</span><br /><b style={{ fontSize: 13, color: GOOD }}>{fmt(r.refNet)}</b> Ar</div>
              <div style={{ ...card, padding: '7px 10px', fontSize: 11.5 }}><span style={{ color: MUT }}>🫱 Parrain</span><br /><b style={{ fontSize: 13, color: GOOD }}>{fmt(r.parrain)}</b> Ar</div>
              <div style={{ ...card, padding: '7px 10px', fontSize: 11.5 }}><span style={{ color: MUT }}>🫱🫱 Grand-parrain</span><br /><b style={{ fontSize: 13, color: GOOD }}>{fmt(r.grandP)}</b> Ar</div>
            </div>
          </div>
        </div>
      </div>
    </Sec>
  );

  const P_needs = (
    <Sec key="n">
      <div style={eyebrow}>🎯 Pour vivre (≈ le SMIG, {fmt(SMIG)} Ar/mois), il te faut</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
        {r.per.map((x) => (
          <div key={x.key} style={{ ...card, padding: '12px 6px', textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: MUT }}>{x.emoji} {x.label}</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: INK, marginTop: 2 }}>≈ {x.pourVivre}</div>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 12.5, color: MUT, marginTop: 12, lineHeight: 1.5 }}>Combien de CE commerce (seul) suffit pour atteindre le SMIG. En mélangeant les activités, tu y arrives bien plus vite.</div>
    </Sec>
  );

  const P_pub = (
    <Sec key="a">
      <div style={{ ...eyebrow, color: BLUE }}>📢 Publicité — un flux À PART (prix fixe)</div>
      <div style={{ fontSize: 12.5, color: MUT, marginBottom: 12, lineHeight: 1.5 }}>Un annonceur que tu as amené lance une campagne : T2M la vend à un prix. <b style={{ color: INK }}>10 % du prix te reviennent</b> (apport), 90 % à la plateforme. Une pub sans référent = 100 % plateforme.</div>
      <Slider label="Prix des pubs des annonceurs que tu as amenés · /mois" value={pub} min={0} max={3000000} step={50000} onChange={setPub} fmtVal={(v) => `${fmt(v)} Ar`} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div style={{ ...card, padding: '10px 12px', fontSize: 12.5 }}>🧑‍🌾 Toi · 10 %<br /><b style={{ fontSize: 16, color: GOOD }}>{fmt(r.pubToi)}</b> Ar</div>
        <div style={{ ...card, padding: '10px 12px', fontSize: 12.5 }}>🏛️ Plateforme · 90 %<br /><b style={{ fontSize: 16, color: MUT }}>{fmt(r.pubPlat)}</b> Ar</div>
      </div>
    </Sec>
  );

  const secs = [P_intro, P_activities, P_result, P_portfolio, P_rates, P_flux, P_needs, P_pub];
  // pages : fragment de pages sœurs (glissées par le deck parent). stack : bloc blanc empilé.
  return pages ? <>{secs}</> : <div style={{ background: '#141518', borderRadius: 16, padding: 14, color: INK }}>{secs}</div>;
}
