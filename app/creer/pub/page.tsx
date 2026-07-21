'use client';
/**
 * /creer/pub — COMPOSER WEB « Publicité » (régie) — Pascal 2026-07-21.
 *
 * MIROIR du composer natif `CreatePubScreen`. Entrée DISTINCTE du contenu (jamais mélangé).
 * Flux ARGENT (intransigeant) : on PAIE D'ABORD via PaPi (fund → checkout → sondage statut),
 * la campagne n'est ACTIVÉE qu'après paiement confirmé (publishAdCard). MGA = Ariary entier.
 *  - fund    : POST /api/ads/fund { amount_cents, title } → { checkout_url, intent_id }
 *  - statut  : GET /api/wallet/topup/status?intent=<id> → { status: 'paid'|'failed'|'pending' }
 *  - publish : POST /api/cards/ad/publish { title, advertiser, format, banner/jingle/video, budget, target }
 */
import { useRef, useState } from 'react';

const ACCENT = '#FF7F11';
const MIN_BUDGET = 300; // PaPi min 300 Ar

async function uploadFile(f: File): Promise<string | null> {
  const fd = new FormData(); fd.append('file', f);
  const r = await fetch('/api/upload', { method: 'POST', credentials: 'include', body: fd });
  if (!r.ok) return null;
  const d = await r.json();
  return typeof d?.url === 'string' ? d.url : null;
}

export default function CreerPubPage() {
  const [format, setFormat] = useState<'banner' | 'video'>('banner');
  const [banner, setBanner] = useState<string | null>(null);
  const [video, setVideo] = useState<string | null>(null);
  const [jingle, setJingle] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [advertiser, setAdvertiser] = useState('');
  const [budget, setBudget] = useState('');
  const [scope, setScope] = useState<'national' | 'region' | 'ville'>('national');
  const [zone, setZone] = useState('');
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<'form' | 'paying' | 'done'>('form');
  const [err, setErr] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const budgetN = Math.round(Number(budget) || 0);
  const media = format === 'banner' ? banner : video;
  const valid = title.trim() !== '' && budgetN >= MIN_BUDGET && !!media && (scope === 'national' || zone.trim() !== '');

  async function pick(accept: string, set: (u: string) => void) {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = accept;
    input.onchange = async () => {
      const f = input.files?.[0]; if (!f) return;
      setBusy(true); setErr(null);
      const url = await uploadFile(f); setBusy(false);
      if (url) set(url); else setErr('Upload échoué');
    };
    input.click();
  }

  function stopPoll() { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } }

  async function publishAd() {
    const payload = {
      title: title.trim(), advertiser: advertiser.trim(), format,
      ...(format === 'banner' ? { banner, ...(jingle ? { jingle } : {}) } : { video }),
      budget: budgetN,
      target: { scope, zone: scope === 'national' ? 'National' : zone.trim() },
    };
    const r = await fetch('/api/cards/ad/publish', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
    const d = await r.json();
    if (!r.ok) { setErr(d?.error || `publication HTTP ${r.status}`); setPhase('form'); return; }
    setPhase('done');
  }

  async function launch() {
    if (!valid || busy) return;
    setBusy(true); setErr(null);
    try {
      // 1) PAYER d'abord (PaPi)
      const fr = await fetch('/api/ads/fund', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ amount_cents: budgetN, title: title.trim() }) });
      const fd = await fr.json();
      if (!fr.ok || !fd?.checkout_url || !fd?.intent_id) { setErr(fd?.error || 'Paiement indisponible'); setBusy(false); return; }
      const intentId: string = fd.intent_id;
      window.open(fd.checkout_url, '_blank'); // PaPi dans un nouvel onglet, le formulaire reste
      setPhase('paying');
      // 2) SONDER le statut jusqu'à payé
      pollRef.current = setInterval(async () => {
        try {
          const s = await fetch(`/api/wallet/topup/status?intent=${encodeURIComponent(intentId)}`, { cache: 'no-store', credentials: 'include' }).then((x) => x.json());
          if (s?.status === 'paid') { stopPoll(); await publishAd(); setBusy(false); }
          else if (s?.status === 'failed') { stopPoll(); setErr('Paiement échoué ou refusé.'); setPhase('form'); setBusy(false); }
        } catch { /* on continue à sonder */ }
      }, 3000);
    } catch (e) { setErr(String(e)); setBusy(false); }
  }

  if (phase === 'done') {
    return (
      <main style={wrap}>
        <div style={{ ...okBox, fontSize: 15 }}>✅ Campagne lancée et payée — la régie la diffuse (bannière/jingle ou pré-roll vidéo) selon ton ciblage.</div>
        <button onClick={() => { setPhase('form'); setBanner(null); setVideo(null); setJingle(null); setTitle(''); setBudget(''); }} style={btn(false)}>Créer une autre pub</button>
      </main>
    );
  }

  if (phase === 'paying') {
    return (
      <main style={wrap}>
        <h1 style={{ fontSize: 22, fontWeight: 900, marginBottom: 10 }}>📢 Paiement en cours…</h1>
        <p style={{ color: '#6A7585' }}>Règle ton budget dans l&apos;onglet PaPi qui vient de s&apos;ouvrir. Dès que c&apos;est payé, la campagne se lance automatiquement ici.</p>
        <div style={{ marginTop: 16, color: '#9AA3AF', fontSize: 13 }}>En attente de confirmation du paiement…</div>
        {err && <p style={{ color: '#C0392B', marginTop: 12 }}>{err}</p>}
        <button onClick={() => { stopPoll(); setPhase('form'); setBusy(false); }} style={{ ...btn(false), background: '#F1F2F4', color: '#6A7585', marginTop: 18 }}>Annuler</button>
      </main>
    );
  }

  const isBanner = format === 'banner';
  return (
    <main style={wrap}>
      <h1 style={{ fontSize: 24, fontWeight: 900, marginBottom: 4 }}>📢 Créer une publicité</h1>
      <p style={{ color: '#9AA3AF', fontSize: 12.5, marginBottom: 16 }}>Régie Talk2Me — bannière+jingle ou vidéo ≤10s. Tu règles ton budget (PaPi), on diffuse selon ton ciblage.</p>

      <div style={{ display: 'flex', marginBottom: 16 }}>
        {seg(isBanner, '🖼️ Bannière', () => setFormat('banner'))}
        {seg(!isBanner, '🎬 Vidéo ≤10s', () => setFormat('video'))}
      </div>

      {isBanner
        ? <Uploader label={banner ? 'Bannière ajoutée ✓' : 'Ajouter la bannière (image)'} done={!!banner} onClick={() => pick('image/*', setBanner)} />
        : <Uploader label={video ? 'Vidéo pub ajoutée ✓' : 'Choisir la vidéo pub (≤ 10 s)'} done={!!video} onClick={() => pick('video/*', setVideo)} />}

      <input style={input} placeholder="Titre de la pub" value={title} onChange={(e) => setTitle(e.target.value)} />
      <input style={input} placeholder="Annonceur" value={advertiser} onChange={(e) => setAdvertiser(e.target.value)} />
      {isBanner && <Uploader label={jingle ? 'Jingle ajouté ✓' : 'Jingle / son (facultatif)'} done={!!jingle} onClick={() => pick('audio/*', setJingle)} />}

      <input style={input} type="number" inputMode="numeric" placeholder={`Budget de la campagne (Ar, min ${MIN_BUDGET})`} value={budget} onChange={(e) => setBudget(e.target.value.replace(/[^0-9]/g, ''))} />

      <label style={lbl}>Ciblage</label>
      <select style={input} value={scope} onChange={(e) => setScope(e.target.value as 'national' | 'region' | 'ville')}>
        <option value="national">National (toute l&apos;audience)</option>
        <option value="region">Région</option>
        <option value="ville">Ville</option>
      </select>
      {scope !== 'national' && <input style={input} placeholder={scope === 'ville' ? 'Nom de la ville' : 'Nom de la région'} value={zone} onChange={(e) => setZone(e.target.value)} />}

      {err && <p style={{ color: '#C0392B', margin: '4px 0' }}>{err}</p>}
      <button onClick={launch} disabled={!valid || busy} style={btn(!valid || busy)}>
        {busy ? '…' : `Lancer la campagne — payer ${budgetN >= MIN_BUDGET ? budgetN.toLocaleString('fr-FR') + ' Ar' : ''}`}
      </button>
      <p style={{ color: '#9AA3AF', fontSize: 11.5, marginTop: 10 }}>Le paiement PaPi se fait AVANT diffusion. La campagne n&apos;est activée qu&apos;une fois le budget réglé.</p>
    </main>
  );
}

const wrap: React.CSSProperties = { maxWidth: 560, margin: '0 auto', padding: '28px 18px', fontFamily: 'Inter, system-ui' };
const input: React.CSSProperties = { width: '100%', padding: 13, borderRadius: 12, border: '1px solid #E7E9EC', fontSize: 15, marginBottom: 10, boxSizing: 'border-box' };
const lbl: React.CSSProperties = { display: 'block', fontSize: 12, color: '#9AA3AF', margin: '4px 0 6px' };
const okBox: React.CSSProperties = { padding: 16, background: '#F1FBF3', border: '1px solid #B8E6C4', borderRadius: 12, color: '#2E5E3E', fontWeight: 600, marginBottom: 14 };
const btn = (disabled: boolean): React.CSSProperties => ({ width: '100%', marginTop: 8, padding: 15, borderRadius: 12, border: 0, background: disabled ? '#CBD0D6' : ACCENT, color: '#fff', fontWeight: 800, fontSize: 16, cursor: disabled ? 'default' : 'pointer' });

function seg(on: boolean, label: string, onClick: () => void) {
  return (
    <button onClick={onClick} style={{ flex: 1, padding: 11, margin: '0 4px', borderRadius: 12, cursor: 'pointer',
      border: `1px solid ${on ? ACCENT : '#E7E9EC'}`, background: on ? ACCENT : '#F1F2F4', color: on ? '#fff' : '#6A7585', fontWeight: 800, fontSize: 14 }}>{label}</button>
  );
}
function Uploader({ label, done, onClick }: { label: string; done: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ width: '100%', textAlign: 'left', padding: 14, marginBottom: 10, borderRadius: 12, cursor: 'pointer',
      border: `1px solid ${done ? `${ACCENT}66` : '#E7E9EC'}`, background: done ? `${ACCENT}1A` : '#F4F5F7', color: '#374151', fontWeight: 700, fontSize: 14 }}>
      {done ? '✓ ' : '＋ '}{label}
    </button>
  );
}
