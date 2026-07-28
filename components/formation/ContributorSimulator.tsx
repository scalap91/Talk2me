'use client';
/**
 * Simulateur de l'économie du contributeur (Module éco de la formation). Split 3 % : 2 % plateforme
 * (fixe) + 1 % distribué au référent. L'utilisateur bouge les curseurs → revenu référent + notre part,
 * en direct. Chiffres en Ariary. Intégré DANS la formation in-app (page /formation, gatée aux recrutés).
 */
import { useMemo, useState } from 'react';

const SMIG = 250000;
const SCALE = 1000;
const fmt = (n: number) => Math.round(n).toLocaleString('fr-FR');

function Slider({ label, value, min, max, step, onChange, fmtVal }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; fmtVal: (v: number) => string }) {
  const p = ((value - min) / (max - min)) * 100;
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 7 }}>
        <label style={{ fontSize: 14, fontWeight: 600, color: '#1A1D22' }}>{label}</label>
        <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 800, color: '#FF7F11', fontSize: 15 }}>{fmtVal(value)}</span>
      </div>
      <input type="range" value={value} min={min} max={max} step={step} onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: '100%', height: 6, borderRadius: 99, appearance: 'none', WebkitAppearance: 'none', outline: 'none', background: `linear-gradient(to right,#FF7F11 ${p}%,#ECEAE6 ${p}%)` }} />
    </div>
  );
}

export default function ContributorSimulator() {
  const [panier, setPanier] = useState(25000);
  const [ventes, setVentes] = useState(15);
  const [nb, setNb] = useState(10);
  const [jours, setJours] = useState(26);
  const [distr, setDistr] = useState(1);
  const [plat, setPlat] = useState(2);
  const [ov, setOv] = useState(15);

  const r = useMemo(() => {
    const gmvC = panier * ventes * jours;
    const refC = gmvC * distr / 100, platC = gmvC * plat / 100;
    const refTot = refC * nb, platTot = platC * nb;
    const ovTot = refTot * ov / 100, par = ovTot * 0.67, gp = ovTot * 0.33, refNet = refTot - ovTot;
    return { gmvC, refC, platC, refTot, platTot, gmvTot: gmvC * nb, ventesMois: ventes * jours, mult: refTot / SMIG, atScale: platC * SCALE, par, gp, refNet };
  }, [panier, ventes, nb, jours, distr, plat, ov]);

  const card: React.CSSProperties = { background: '#fff', border: '1px solid #ECEAE6', borderRadius: 16, boxShadow: '0 1px 2px rgba(26,29,34,.04),0 8px 24px rgba(26,29,34,.06)' };
  const above = r.refTot >= SMIG;
  const tn: React.CSSProperties = { border: '1px solid #ECEAE6', borderRadius: 12, padding: '9px 13px', fontSize: 13, background: '#fff', fontVariantNumeric: 'tabular-nums', lineHeight: 1.35 };
  const tconn: React.CSSProperties = { fontSize: 11, color: '#9AA0A8', padding: '5px 0' };
  const leafSpan: React.CSSProperties = { display: 'block', fontSize: 11.5, color: '#6E7480', marginBottom: 3, fontWeight: 600 };

  return (
    <div style={{ margin: '18px 0' }}>
      {/* LE RÉSULTAT EN HAUT (Pascal 2026-07-28) : le montant frappe direct, avant même les curseurs. */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
        <div style={{ ...card, padding: 18, border: '1px solid #FF7F11', background: 'linear-gradient(180deg,rgba(255,127,17,.12),transparent 70%)' }}>
          <div style={{ fontSize: 12, color: '#6E7480', fontWeight: 600 }}>🧑‍🌾 Revenu du référent · / mois</div>
          <div style={{ fontVariantNumeric: 'tabular-nums', fontSize: 30, fontWeight: 800, letterSpacing: '-.02em', margin: '8px 0 2px' }}>{fmt(r.refTot)} Ar</div>
          <div style={{ fontSize: 13.5, color: '#9AA0A8', fontWeight: 600 }}>{fmt(r.refC)} Ar par commerce · {nb} commerce{nb > 1 ? 's' : ''}</div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700, padding: '3px 9px', borderRadius: 99, marginTop: 10, background: above ? 'rgba(18,183,106,.12)' : 'rgba(255,127,17,.12)', color: above ? '#12B76A' : '#E8890C' }}>
            {above ? `✓ ×${r.mult.toFixed(1).replace('.', ',')} le SMIG` : `${Math.round(r.mult * 100)} % du SMIG — élargis le portefeuille`}
          </div>
        </div>
        <div style={{ ...card, padding: 18 }}>
          <div style={{ fontSize: 12, color: '#6E7480', fontWeight: 600 }}>🏛️ Notre part (plateforme) · / mois</div>
          <div style={{ fontVariantNumeric: 'tabular-nums', fontSize: 30, fontWeight: 800, letterSpacing: '-.02em', margin: '8px 0 2px' }}>{fmt(r.platTot)} Ar</div>
          <div style={{ fontSize: 13.5, color: '#9AA0A8', fontWeight: 600 }}>sur ce portefeuille</div>
          <div style={{ fontSize: 12.5, color: '#6E7480', marginTop: 8 }}>À {fmt(SCALE)} commerces comme ça → <b>{fmt(r.atScale)} Ar/mois</b> pour nous.</div>
        </div>
      </div>

      <div style={{ ...card, padding: 18, marginBottom: 14 }}>
        <div style={{ fontSize: 12, letterSpacing: '.08em', textTransform: 'uppercase', color: '#6E7480', fontWeight: 700, marginBottom: 14 }}>Tes hypothèses — bouge les curseurs</div>
        <Slider label="Panier moyen par vente" value={panier} min={2000} max={200000} step={1000} onChange={setPanier} fmtVal={(v) => `${fmt(v)} Ar`} />
        <Slider label="Ventes par jour · par commerce" value={ventes} min={1} max={80} step={1} onChange={setVentes} fmtVal={(v) => `${v}`} />
        <Slider label="Commerces servis (ton portefeuille)" value={nb} min={1} max={60} step={1} onChange={setNb} fmtVal={(v) => `${v}`} />
        <Slider label="Jours actifs par mois" value={jours} min={1} max={31} step={1} onChange={setJours} fmtVal={(v) => `${v}`} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Slider label="Part distribuée" value={distr} min={0} max={3} step={0.1} onChange={setDistr} fmtVal={(v) => `${v.toFixed(1).replace('.', ',')} %`} />
          <Slider label="Notre part" value={plat} min={0} max={5} step={0.1} onChange={setPlat} fmtVal={(v) => `${v.toFixed(1).replace('.', ',')} %`} />
        </div>
        <Slider label="Override qui remonte aux parrains" value={ov} min={0} max={40} step={1} onChange={setOv} fmtVal={(v) => `${v} % du 1%`} />
      </div>

      {/* 🌳 L'arbre du flux financier — de l'activité aux wallets */}
      <div style={{ ...card, padding: 18, marginBottom: 14, overflowX: 'auto' }}>
        <div style={{ fontSize: 12, letterSpacing: '.08em', textTransform: 'uppercase', color: '#6E7480', fontWeight: 700, marginBottom: 14 }}>🌳 Le flux financier — de l'activité aux wallets</div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', minWidth: 300 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center', marginBottom: 2 }}>
            {['🍽️ Restaurants', '🛍️ Boutiques', '🍲 Plats maison', '🏷️ Annonces', '🔧 Services', '🛵 Livraison'].map((s) => (
              <div key={s} style={{ ...tn, fontSize: 12, padding: '6px 11px', color: '#6E7480', fontWeight: 600 }}>{s}</div>
            ))}
          </div>
          <div style={tconn}>↓ toutes ces activités génèrent des ventes qui passent dans l'app</div>
          <div style={{ ...tn, background: 'rgba(255,127,17,.12)', borderColor: '#FF7F11' }}>Total activités · portefeuille<br /><b style={{ fontSize: 15 }}>{fmt(r.gmvTot)}</b> Ar de ventes / mois</div>
          <div style={tconn}>↓ 3 % de commission</div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center', alignItems: 'flex-start' }}>
            <div style={{ ...tn, background: 'rgba(110,116,128,.08)' }}>🏛️ Plateforme · 2 %<br /><b style={{ fontSize: 15, color: '#6E7480' }}>{fmt(r.platTot)}</b> Ar → 🪙</div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{ ...tn, background: 'rgba(255,127,17,.12)', fontWeight: 700 }}>1 % distribué</div>
              <div style={tconn}>↓ remonte l'arbre des parrains</div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
                <div style={tn}><span style={leafSpan}>🧑‍🌾 Toi · référent</span><b style={{ fontSize: 15, color: '#12B76A' }}>{fmt(r.refNet)}</b> Ar → 🪙</div>
                <div style={tn}><span style={leafSpan}>🫱 Ton parrain</span><b style={{ fontSize: 15, color: '#12B76A' }}>{fmt(r.par)}</b> Ar → 🪙</div>
                <div style={tn}><span style={leafSpan}>🫱🫱 Grand-parrain</span><b style={{ fontSize: 15, color: '#12B76A' }}>{fmt(r.gp)}</b> Ar → 🪙</div>
              </div>
            </div>
          </div>
        </div>
        <p style={{ fontSize: 12.5, color: '#6E7480', marginTop: 12 }}>Chaque Ariary tombe dans les <b>wallets</b> : la plateforme, toi qui sers, tes parrains. « Toi » = ton 1 % <b>moins</b> l'override qui récompense ceux qui t'ont formé/recruté.</p>
      </div>

      <div style={{ ...card, padding: '14px 18px' }}>
        {[['CA / commerce / mois', `${fmt(r.gmvC)} Ar`], ['→ Référent / commerce', `${fmt(r.refC)} Ar`], ['→ Nous / commerce', `${fmt(r.platC)} Ar`], ['CA total du portefeuille', `${fmt(r.gmvTot)} Ar`]].map(([k, v], i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderTop: i ? '1px solid #ECEAE6' : 'none', fontSize: 14 }}>
            <span style={{ color: '#6E7480' }}>{k}</span><span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>{v}</span>
          </div>
        ))}
      </div>
      <p style={{ fontSize: 12.5, color: '#6E7480', marginTop: 12, lineHeight: 1.6 }}>
        Non compté (donc c'est un <b>plancher</b>) : ton <b>propre commerce</b> · la <b>prime d'apport</b> · l'<b>override</b> (prélevé sur le 1 %). Condition réelle : que les commerces <b>transactionnent dans l'app</b> — et tu es payé à pousser cet usage.
      </p>
    </div>
  );
}
