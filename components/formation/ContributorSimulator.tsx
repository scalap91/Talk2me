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
const DEFAULT: Row[] = [
  { key: 'resto', emoji: '🍽️', label: 'Restaurants', comm: 3, vpj: 15, panier: 25000 },
  { key: 'boutique', emoji: '🛍️', label: 'Boutiques', comm: 3, vpj: 10, panier: 30000 },
  { key: 'plats', emoji: '🍲', label: 'Plats maison', comm: 2, vpj: 6, panier: 8000 },
  { key: 'annonces', emoji: '🏷️', label: 'Annonces', comm: 2, vpj: 1, panier: 50000 },
  { key: 'services', emoji: '🔧', label: 'Services', comm: 1, vpj: 2, panier: 40000 },
  { key: 'livraison', emoji: '🛵', label: 'Livraison', comm: 4, vpj: 20, panier: 5000 },
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

export default function ContributorSimulator({ pages = false }: { pages?: boolean }) {
  const [rows, setRows] = useState<Row[]>(DEFAULT.map((r) => ({ ...r })));
  const [jours, setJours] = useState(26);
  const [distr, setDistr] = useState(1);
  const [plat, setPlat] = useState(2);
  const [ov, setOv] = useState(15);
  const [pub, setPub] = useState(200000);
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
    return { per, totalCA, totalComm, refGross, refNet, parrain, grandP, platTot, smigMult: refGross / SMIG, pubToi, pubPlat, total: refNet + pubToi };
  }, [rows, jours, distr, plat, ov, pub]);
  const above = r.refGross >= SMIG;

  // Enveloppe de section : PAGE plein écran blanche (deck) ou bloc empilé (page /formation).
  const Sec = ({ children }: { children: React.ReactNode }) => pages
    ? <div className="shrink-0 basis-full snap-center snap-always overflow-y-auto" style={{ height: '100%', background: PANE, color: INK }}><div style={{ padding: 'calc(env(safe-area-inset-top) + 72px) 16px calc(env(safe-area-inset-bottom) + 96px)', maxWidth: 560, margin: '0 auto' }}>{children}</div></div>
    : <div style={{ marginBottom: 14 }}>{children}</div>;

  const P_result = (
    <Sec key="r">
      <div style={eyebrow}>💥 Ce que tu gagnes chaque mois</div>
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
        <div key={x.key} style={{ padding: '9px 0', borderTop: i ? `1px solid ${LINE}` : 'none' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
            <span style={{ fontSize: 14, fontWeight: 700 }}>{x.emoji} {x.label}</span>
            <span style={{ fontSize: 13, fontWeight: 800, color: GOOD, fontVariantNumeric: 'tabular-nums' }}>+{fmt(x.toiOne * x.comm)} Ar</span>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <label style={{ fontSize: 11, color: MUT }}>Comm. <Num value={x.comm} min={0} max={200} w={50} onChange={(v) => set(i, 'comm', v)} /></label>
            <label style={{ fontSize: 11, color: MUT }}>Ventes/j <Num value={x.vpj} min={0} max={500} w={54} onChange={(v) => set(i, 'vpj', v)} /></label>
            <label style={{ fontSize: 11, color: MUT }}>Panier <Num value={x.panier} min={0} max={2000000} w={78} onChange={(v) => set(i, 'panier', v)} /></label>
            <span style={{ fontSize: 11.5, color: FAINT, marginLeft: 'auto', fontVariantNumeric: 'tabular-nums' }}>CA {fmt(x.ca)}</span>
          </div>
        </div>
      ))}
      <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: `2px solid ${ACC}`, marginTop: 8, paddingTop: 8, fontSize: 13.5, fontWeight: 800 }}>
        <span>Total · {r.totalComm} commerces</span><span style={{ color: ACC, fontVariantNumeric: 'tabular-nums' }}>{fmt(r.totalCA)} Ar/mois</span>
      </div>
      <div style={{ marginTop: 12 }}><Slider label="Jours actifs par mois" value={jours} min={1} max={31} step={1} onChange={setJours} fmtVal={(v) => `${v}`} /></div>
    </Sec>
  );

  const P_rates = (
    <Sec key="t">
      <div style={eyebrow}>Les taux</div>
      <Slider label="Part distribuée au référent" value={distr} min={0} max={3} step={0.1} onChange={setDistr} fmtVal={(v) => `${v.toFixed(1).replace('.', ',')} %`} />
      <Slider label="Notre part (plateforme)" value={plat} min={0} max={5} step={0.1} onChange={setPlat} fmtVal={(v) => `${v.toFixed(1).replace('.', ',')} %`} />
      <Slider label="Override qui remonte aux parrains" value={ov} min={0} max={40} step={1} onChange={setOv} fmtVal={(v) => `${v} % du 1%`} />
      <div style={{ fontSize: 12.5, color: MUT, marginTop: 6, lineHeight: 1.5 }}>Commission 3 % par vente = <b style={{ color: INK }}>2 % plateforme + 1 % référent</b>. L'override est prélevé sur ton 1 % pour récompenser ceux qui t'ont formé/recruté.</div>
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

  const secs = [P_result, P_portfolio, P_rates, P_flux, P_needs, P_pub];
  // pages : fragment de pages sœurs (glissées par le deck parent). stack : bloc blanc empilé.
  return pages ? <>{secs}</> : <div style={{ background: '#141518', borderRadius: 16, padding: 14, color: INK }}>{secs}</div>;
}
