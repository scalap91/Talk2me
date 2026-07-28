'use client';
/**
 * SIMULATEUR — « L'économie du contributeur » (Pascal 2026-07-28, d'après son artifact de référence).
 * Version MOBILE (l'artifact était desktop) pour tenir dans la card formation, thème SOMBRE.
 *
 * Modèle : chaque ACTIVITÉ se règle indépendamment (commerces × ventes/jour × panier × jours = CA/mois).
 * Commission 3 % par vente = 2 % plateforme + 1 % distribué au référent ; l'override remonte une part du
 * 1 % aux parrains. La PUB est un flux À PART (prix fixe, 10 % au contributeur qui a amené l'annonceur).
 * Tout en Ariary. Le RÉSULTAT (ce que tu gagnes) est mis EN HAUT — le montant frappe direct.
 */
import { useMemo, useState } from 'react';

const SMIG = 250000;
const fmt = (n: number) => Math.round(n).toLocaleString('fr-FR');

interface Row { key: string; emoji: string; label: string; comm: number; vpj: number; panier: number }
const DEFAULT: Row[] = [
  { key: 'resto', emoji: '🍽️', label: 'Restaurants', comm: 3, vpj: 15, panier: 25000 },
  { key: 'boutique', emoji: '🛍️', label: 'Boutiques', comm: 3, vpj: 10, panier: 30000 },
  { key: 'plats', emoji: '🍲', label: 'Plats maison', comm: 2, vpj: 6, panier: 8000 },
  { key: 'annonces', emoji: '🏷️', label: 'Annonces', comm: 2, vpj: 1, panier: 50000 },
  { key: 'services', emoji: '🔧', label: 'Services', comm: 1, vpj: 2, panier: 40000 },
  { key: 'livraison', emoji: '🛵', label: 'Livraison', comm: 4, vpj: 20, panier: 5000 },
];

// palette sombre
const C = { bg: '#141518', card: '#1B1D21', line: '#2A2D33', ink: '#F4F5F7', dim: '#9AA0A8', accent: '#FF7F11', green: '#12B76A' };
const box: React.CSSProperties = { background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, padding: 14, marginBottom: 12 };
const eyebrow: React.CSSProperties = { fontSize: 11, letterSpacing: '.06em', textTransform: 'uppercase', color: C.dim, fontWeight: 800, marginBottom: 10 };

function Num({ value, onChange, min, max, w = 62 }: { value: number; onChange: (v: number) => void; min: number; max: number; w?: number }) {
  return (
    <input type="number" value={value} min={min} max={max}
      onChange={(e) => { const v = Number(e.target.value); onChange(Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : min); }}
      style={{ width: w, background: '#0f1013', border: `1px solid ${C.line}`, borderRadius: 8, color: C.ink, fontSize: 13, fontWeight: 700, padding: '6px 8px', textAlign: 'center', fontVariantNumeric: 'tabular-nums', outline: 'none' }} />
  );
}
function Slider({ label, value, min, max, step, onChange, fmtVal }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; fmtVal: (v: number) => string }) {
  const p = ((value - min) / (max - min)) * 100;
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>{label}</span>
        <span style={{ fontWeight: 800, color: C.accent, fontSize: 14, fontVariantNumeric: 'tabular-nums' }}>{fmtVal(value)}</span>
      </div>
      <input type="range" value={value} min={min} max={max} step={step} onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: '100%', height: 6, borderRadius: 99, appearance: 'none', WebkitAppearance: 'none', outline: 'none', background: `linear-gradient(to right,${C.accent} ${p}%,${C.line} ${p}%)` }} />
    </div>
  );
}

export default function ContributorSimulator() {
  const [rows, setRows] = useState<Row[]>(DEFAULT.map((r) => ({ ...r })));
  const [jours, setJours] = useState(26);
  const [distr, setDistr] = useState(1);
  const [plat, setPlat] = useState(2);
  const [ov, setOv] = useState(15);
  const [pub, setPub] = useState(200000);

  const set = (i: number, k: keyof Row, v: number) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, [k]: v } : r)));

  const r = useMemo(() => {
    const per = rows.map((x) => {
      const ca = x.comm * x.vpj * x.panier * jours;         // CA/mois de l'activité
      const caOne = x.vpj * x.panier * jours;               // CA d'UN commerce
      const toiOne = caOne * (distr / 100) * (1 - ov / 100);// ce qu'1 commerce te rapporte (net override)
      const pourVivre = toiOne > 0 ? Math.ceil(SMIG / toiOne) : 0; // combien de CE commerce pour vivre
      return { ...x, ca, caOne, toiOne, pourVivre };
    });
    const totalCA = per.reduce((s, x) => s + x.ca, 0);
    const totalComm = per.reduce((s, x) => s + x.comm, 0);
    const refGross = totalCA * distr / 100;                 // commission référent (brute)
    const overrideTot = refGross * ov / 100;
    const refNet = refGross - overrideTot;                  // ce que TOI tu touches (net)
    const parrain = overrideTot * 0.67, grandP = overrideTot * 0.33;
    const platTot = totalCA * plat / 100;
    const smigMult = refGross / SMIG;
    const pubToi = pub * 0.10, pubPlat = pub * 0.90;
    return { per, totalCA, totalComm, refGross, overrideTot, refNet, parrain, grandP, platTot, smigMult, pubToi, pubPlat };
  }, [rows, jours, distr, plat, ov, pub]);

  const above = r.refGross >= SMIG;

  return (
    <div style={{ background: C.bg, borderRadius: 16, padding: 14, margin: '14px 0', color: C.ink }}>
      {/* RÉSULTAT EN HAUT — le montant frappe direct */}
      <div style={{ ...box, border: `1px solid ${C.accent}`, background: 'linear-gradient(180deg,rgba(255,127,17,.14),transparent 70%)', marginBottom: 12 }}>
        <div style={{ fontSize: 12, color: C.dim, fontWeight: 600 }}>🧑‍🌾 Ta commission de référent · / mois</div>
        <div style={{ fontVariantNumeric: 'tabular-nums', fontSize: 32, fontWeight: 800, letterSpacing: '-.02em', margin: '6px 0 2px', color: C.ink }}>{fmt(r.refGross)} Ar</div>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 800, padding: '3px 10px', borderRadius: 99, background: above ? 'rgba(18,183,106,.15)' : 'rgba(255,127,17,.15)', color: above ? C.green : C.accent }}>
          {above ? `✓ ×${r.smigMult.toFixed(1).replace('.', ',')} le SMIG` : `${Math.round(r.smigMult * 100)} % du SMIG`}
        </div>
        <div style={{ fontSize: 12.5, color: C.dim, marginTop: 8 }}>sur {r.totalComm} commerce{r.totalComm > 1 ? 's' : ''} · notre part plateforme : <b style={{ color: C.ink }}>{fmt(r.platTot)} Ar</b></div>
      </div>

      {/* TON PORTEFEUILLE — activité par activité (éditable) */}
      <div style={box}>
        <div style={eyebrow}>Ton portefeuille, activité par activité</div>
        <div style={{ fontSize: 12, color: C.dim, marginBottom: 10 }}>Règle chaque ligne à ta réalité : combien de commerces, de ventes/jour, quel panier.</div>
        {r.per.map((x, i) => (
          <div key={x.key} style={{ padding: '10px 0', borderTop: i ? `1px solid ${C.line}` : 'none' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 7 }}>
              <span style={{ fontSize: 14, fontWeight: 700 }}>{x.emoji} {x.label}</span>
              <span style={{ fontSize: 13, fontWeight: 800, color: C.green, fontVariantNumeric: 'tabular-nums' }}>+{fmt(x.toiOne * x.comm)} Ar</span>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <label style={{ fontSize: 11, color: C.dim }}>Comm. <Num value={x.comm} min={0} max={200} w={52} onChange={(v) => set(i, 'comm', v)} /></label>
              <label style={{ fontSize: 11, color: C.dim }}>Ventes/j <Num value={x.vpj} min={0} max={500} w={56} onChange={(v) => set(i, 'vpj', v)} /></label>
              <label style={{ fontSize: 11, color: C.dim }}>Panier <Num value={x.panier} min={0} max={2000000} w={80} onChange={(v) => set(i, 'panier', v)} /></label>
              <span style={{ fontSize: 11.5, color: C.dim, marginLeft: 'auto', fontVariantNumeric: 'tabular-nums' }}>CA {fmt(x.ca)} Ar</span>
            </div>
          </div>
        ))}
        <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: `1px solid ${C.accent}`, marginTop: 8, paddingTop: 8, fontSize: 13.5, fontWeight: 800 }}>
          <span>Total · {r.totalComm} commerces</span><span style={{ color: C.accent, fontVariantNumeric: 'tabular-nums' }}>{fmt(r.totalCA)} Ar/mois</span>
        </div>
        <div style={{ marginTop: 12 }}>
          <Slider label="Jours actifs par mois" value={jours} min={1} max={31} step={1} onChange={setJours} fmtVal={(v) => `${v}`} />
        </div>
      </div>

      {/* LES TAUX */}
      <div style={box}>
        <div style={eyebrow}>Les taux</div>
        <Slider label="Part distribuée au référent" value={distr} min={0} max={3} step={0.1} onChange={setDistr} fmtVal={(v) => `${v.toFixed(1).replace('.', ',')} %`} />
        <Slider label="Notre part (plateforme)" value={plat} min={0} max={5} step={0.1} onChange={setPlat} fmtVal={(v) => `${v.toFixed(1).replace('.', ',')} %`} />
        <Slider label="Override qui remonte aux parrains" value={ov} min={0} max={40} step={1} onChange={setOv} fmtVal={(v) => `${v} % du 1%`} />
      </div>

      {/* POUR VIVRE — combien de CHAQUE activité (seule) pour atteindre le SMIG */}
      <div style={{ ...box, background: 'rgba(255,127,17,.06)' }}>
        <div style={eyebrow}>🎯 Pour vivre (≈ le SMIG, {fmt(SMIG)} Ar/mois), il te faut</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
          {r.per.map((x) => (
            <div key={x.key} style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 10, padding: '8px 6px', textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: C.dim }}>{x.emoji} {x.label}</div>
              <div style={{ fontSize: 17, fontWeight: 800, color: C.ink }}>≈ {x.pourVivre}</div>
            </div>
          ))}
        </div>
      </div>

      {/* LE FLUX FINANCIER — de l'activité aux wallets */}
      <div style={{ ...box, textAlign: 'center' }}>
        <div style={{ ...eyebrow, textAlign: 'left' }}>🌳 Le flux financier — de l'activité aux wallets</div>
        <div style={{ display: 'inline-block', background: 'rgba(255,127,17,.12)', border: `1px solid ${C.accent}`, borderRadius: 10, padding: '8px 14px', fontSize: 13 }}>
          Total activités<br /><b style={{ fontSize: 16 }}>{fmt(r.totalCA)}</b> Ar de ventes / mois
        </div>
        <div style={{ fontSize: 11, color: C.dim, padding: '6px 0' }}>↓ 3 % de commission</div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 10, padding: '8px 12px', fontSize: 12.5 }}>🏛️ Plateforme · 2 %<br /><b style={{ fontSize: 14, color: C.dim }}>{fmt(r.platTot)}</b> Ar → 🪙</div>
          <div>
            <div style={{ background: 'rgba(255,127,17,.12)', border: `1px solid ${C.line}`, borderRadius: 10, padding: '6px 12px', fontSize: 12.5, fontWeight: 700 }}>1 % distribué</div>
            <div style={{ fontSize: 11, color: C.dim, padding: '5px 0' }}>↓ remonte l'arbre des parrains</div>
            <div style={{ display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap' }}>
              <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 10, padding: '7px 10px', fontSize: 11.5 }}><span style={{ color: C.dim }}>🧑‍🌾 Toi</span><br /><b style={{ fontSize: 13, color: C.green }}>{fmt(r.refNet)}</b> Ar</div>
              <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 10, padding: '7px 10px', fontSize: 11.5 }}><span style={{ color: C.dim }}>👍 Parrain</span><br /><b style={{ fontSize: 13, color: C.green }}>{fmt(r.parrain)}</b> Ar</div>
              <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 10, padding: '7px 10px', fontSize: 11.5 }}><span style={{ color: C.dim }}>👍👍 Grand-parrain</span><br /><b style={{ fontSize: 13, color: C.green }}>{fmt(r.grandP)}</b> Ar</div>
            </div>
          </div>
        </div>
      </div>

      {/* PUBLICITÉ — flux À PART */}
      <div style={{ ...box, border: '1px solid #3B82F6', marginBottom: 0 }}>
        <div style={{ ...eyebrow, color: '#60A5FA' }}>📢 Publicité — un flux À PART (prix fixe, pas de %)</div>
        <div style={{ fontSize: 12.5, color: C.dim, marginBottom: 10, lineHeight: 1.5 }}>Un annonceur que tu as amené lance une campagne : T2M la vend à un prix. <b style={{ color: C.ink }}>10 % du prix te reviennent</b> (apport), 90 % à la plateforme. Une pub sans référent = 100 % plateforme.</div>
        <Slider label="Prix des pubs des annonceurs que tu as amenés · /mois" value={pub} min={0} max={5000000} step={50000} onChange={setPub} fmtVal={(v) => `${fmt(v)} Ar`} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 10, padding: '9px 12px', fontSize: 12.5 }}>🧑‍🌾 Toi · 10 %<br /><b style={{ fontSize: 15, color: C.green }}>{fmt(r.pubToi)}</b> Ar</div>
          <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 10, padding: '9px 12px', fontSize: 12.5 }}>🏛️ Plateforme · 90 %<br /><b style={{ fontSize: 15, color: C.dim }}>{fmt(r.pubPlat)}</b> Ar</div>
        </div>
      </div>
    </div>
  );
}
