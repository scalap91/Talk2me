'use client';

/**
 * Talk2Me — LE CALCULATEUR du contributeur (Pascal 2026-07-30).
 * MÊME FORME que le tableau vu en FORMATION (ContributorSimulator) — pour que les gens la reconnaissent —
 * mais transformé en CALCULATEUR : chaque valeur est RÉELLE et en LECTURE SEULE (lue de mes cards via
 * getPortfolio + contributor_commissions). On garde résultat / portefeuille / taux / flux ; on vire
 * seulement le laïus de recrutement et les cases où on tape. 0 tant qu'aucune card ne vend.
 */
import { Pencil } from '@/lib/icons';

interface Line { n: number; cents: number }

// Palette SOMBRE — identique au simulateur de formation (Pascal « laisse en noir c'est immersif »).
const INK = '#F4F5F7', MUT = '#9AA0A8', FAINT = '#6E7480', LINE = '#2A2D33', ACC = '#FF9A3D', GOOD = '#3DD68C', CARDBG = '#1B1D21';
const SMIG = 250000;
const DOMAINS: [string, string, string][] = [
  ['restaurants', '🍽️', 'Restaurants'],
  ['boutiques', '🛍️', 'Boutiques'],
  ['transport', '🛵', 'Transport'],
  ['annonces', '🏷️', 'Annonces'],
  ['communication', '💬', 'Réseau'],
];
const fmt = (cents: number) => Math.round((cents || 0) / 100).toLocaleString('fr-FR');
const card: React.CSSProperties = { background: CARDBG, border: `1px solid ${LINE}`, borderRadius: 16, boxShadow: '0 1px 2px rgba(0,0,0,.3),0 8px 24px rgba(0,0,0,.35)' };
const eyebrow: React.CSSProperties = { fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase', color: MUT, fontWeight: 800, marginBottom: 10 };

export default function ContributorCalculateur({ portfolio, earnedCents, pendingCents, overridePct = 0, attached = [] }: { portfolio: Record<string, Line>; earnedCents: number; pendingCents: number; overridePct?: number; attached?: { id: string; name: string; kind: string; owner_name: string }[] }) {
  const total = (earnedCents || 0) + (pendingCents || 0);
  const totalAr = Math.round(total / 100);
  const nbCommerces = DOMAINS.reduce((s, [k]) => s + (portfolio[k]?.n || 0), 0);
  const smigMult = totalAr / SMIG;
  const above = totalAr >= SMIG;
  // Flux (ex-P_flux) : ta commission (1% = ce total) se partage ; l'override remonte à tes parrains.
  const parrainsCut = Math.round(total * (overridePct / 100));
  const toiNet = total - parrainsCut;

  return (
    <div style={{ background: '#141518', borderRadius: 16, padding: 14, color: INK }}>

      {/* ── Résultat (ex-P_result) — RÉEL ── */}
      <div style={{ ...card, padding: 18, border: `1px solid ${ACC}`, background: 'linear-gradient(180deg,rgba(255,127,17,.12),transparent 70%)', marginBottom: 14 }}>
        <div style={{ fontSize: 12, color: MUT, fontWeight: 600 }}>🧑‍🌾 Ce que tu gagnes — au réel</div>
        <div style={{ fontVariantNumeric: 'tabular-nums', fontSize: 33, fontWeight: 800, letterSpacing: '-.02em', margin: '6px 0 2px', color: INK }}>{fmt(total)} Ar</div>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 800, padding: '3px 10px', borderRadius: 99, background: above ? 'rgba(18,183,106,.12)' : 'rgba(255,127,17,.12)', color: above ? GOOD : ACC }}>{above ? `✓ ×${smigMult.toFixed(1).replace('.', ',')} le SMIG` : `${Math.round(smigMult * 100)} % du SMIG`}</span>
        <div style={{ fontSize: 12.5, color: MUT, marginTop: 8 }}>✓ {fmt(earnedCents)} Ar payé · ⏳ {fmt(pendingCents)} Ar en attente · sur {nbCommerces} commerce{nbCommerces > 1 ? 's' : ''}</div>
      </div>

      {/* ── Fiches ATTACHÉES (gérées comme référent/apporteur) — VISIBLES MÊME SANS VENTE (Pascal 2026-08-05) ── */}
      {attached.length > 0 && (
        <div style={{ ...card, padding: 14, marginBottom: 14 }}>
          <div style={eyebrow}>🔗 Fiches attachées · {attached.length}</div>
          {attached.map((a, i) => (
            <div key={a.id} style={{ padding: '8px 0', borderTop: i ? `1px solid ${LINE}` : 'none', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 13.5, fontWeight: 700, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.kind === 'eat' ? '🍽️' : a.kind === 'plat_maison' ? '🍲' : '🛍️'} {a.name}</span>
              <span style={{ fontSize: 12, color: MUT, whiteSpace: 'nowrap' }}>de {a.owner_name}</span>
              <button onClick={() => { window.location.href = `/ma-boutique/${a.id}`; }} title="Modifier" aria-label="Modifier la boutique"
                style={{ width: 32, height: 32, borderRadius: 999, border: `1px solid ${LINE}`, background: 'rgba(255,255,255,0.06)', color: INK, cursor: 'pointer', flex: '0 0 32px', display: 'grid', placeItems: 'center' }}><Pencil className="w-4 h-4" /></button>
            </div>
          ))}
          <div style={{ fontSize: 11.5, color: FAINT, marginTop: 8 }}>Tu les gères comme référent — ta part tombe dès qu&apos;elles vendent.</div>
        </div>
      )}

      {/* ── Portefeuille (ex-P_portfolio) — LECTURE SEULE, lu des cards ── */}
      <div style={{ marginBottom: 14 }}>
        <div style={eyebrow}>Ton portefeuille · lu de tes cards</div>
        {DOMAINS.map(([k, ic, label], i) => {
          const l = portfolio[k] || { n: 0, cents: 0 };
          const on = l.n > 0 || l.cents > 0;
          return (
            <div key={k} style={{ padding: '9px 0', borderTop: i ? `1px solid ${LINE}` : 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center', opacity: on ? 1 : .5 }}>
              <span style={{ fontSize: 13.5, fontWeight: 700 }}>{ic} {label}</span>
              <span style={{ display: 'flex', gap: 16, alignItems: 'baseline' }}>
                <span style={{ fontSize: 12, color: MUT }}>{l.n} commerce{l.n > 1 ? 's' : ''}</span>
                <b style={{ fontSize: 13.5, color: l.cents > 0 ? GOOD : FAINT, fontVariantNumeric: 'tabular-nums', minWidth: 74, textAlign: 'right' }}>+{fmt(l.cents)} Ar</b>
              </span>
            </div>
          );
        })}
        <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: `2px solid ${ACC}`, marginTop: 6, paddingTop: 8, fontSize: 13.5, fontWeight: 800 }}>
          <span>Total · {nbCommerces} commerce{nbCommerces > 1 ? 's' : ''}</span><span style={{ color: ACC, fontVariantNumeric: 'tabular-nums' }}>{fmt(total)} Ar</span>
        </div>
        {nbCommerces === 0 && <div style={{ fontSize: 12, color: FAINT, marginTop: 10, lineHeight: 1.5 }}>0 commerce → 0 gain, c&apos;est la vérité. Parraine un compte et crée-lui une boutique → elle apparaît ici avec ses gains, toute seule.</div>}
      </div>

      {/* ── Les taux (ex-P_rates) — info fixe, identique formation ── */}
      <div style={{ marginBottom: 14 }}>
        <div style={eyebrow}>Comment ça se partage — fixé par Talk2Me</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[['🧑‍🌾 Toi, le référent', '1 %', true], ['🏛️ La plateforme', '2 %', false], ['👍 Tes parrains — sur ton 1 %', '15 %', false], ['📢 Toi, sur une pub que tu amènes', '10 %', true]].map(([label, val, good]) => (
            <div key={label as string} style={{ ...card, padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13.5 }}>{label as string}</span><b style={{ fontSize: 16, color: good ? GOOD : INK, fontVariantNumeric: 'tabular-nums' }}>{val as string}</b>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 12, color: MUT, marginTop: 10, lineHeight: 1.5 }}>Commission totale = <b style={{ color: INK }}>3 % par vente</b> (2 % plateforme + 1 % pour toi). Tu ne règles rien — ces taux sont les mêmes pour tous. Ce qui change, c&apos;est ce que tes cards génèrent.</div>
      </div>

      {/* ── Le flux (ex-P_flux) — RÉEL : ce que tu touches vs ce qui remonte à tes parrains ── */}
      <div>
        <div style={eyebrow}>🌳 Où va ton argent</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ ...card, padding: '11px 13px', flex: '1 1 130px' }}><div style={{ fontSize: 11.5, color: MUT }}>🧑‍🌾 Toi (net)</div><b style={{ fontSize: 16, color: GOOD, fontVariantNumeric: 'tabular-nums' }}>{fmt(toiNet)} Ar</b></div>
          <div style={{ ...card, padding: '11px 13px', flex: '1 1 130px' }}><div style={{ fontSize: 11.5, color: MUT }}>🫱 Tes parrains ({overridePct}%)</div><b style={{ fontSize: 16, color: INK, fontVariantNumeric: 'tabular-nums' }}>{fmt(parrainsCut)} Ar</b></div>
        </div>
      </div>
    </div>
  );
}
