'use client';
/**
 * MusicMetaSheet — formulaire DDEX web (Pascal 2026-09-08), miroir du natif `music_meta.dart`.
 * Parité : le composer natif a une section « Métadonnées de distribution (DDEX) » que le web
 * n'avait pas, alors que l'endpoint /api/cards/media/publish accepte déjà le bloc `music`
 * (readMusic → work/recording/release/rights/ids). Ce sheet produit EXACTEMENT cet objet.
 * Optionnel : tout vide = pas de bloc `music`. Champs nettoyés (on n'envoie que le renseigné).
 */
import { useState } from 'react';
import { X, Plus, Trash2 } from '@/lib/icons';

const INK = '#2F343A';
const LANGS = ['Malagasy', 'Français', 'Anglais', 'Instrumental', 'Autre'];
const REL_TYPES: [string, string][] = [['single', 'Single'], ['ep', 'EP'], ['album', 'Album'], ['compilation', 'Compilation']];
const CMOS = ['Aucune', 'OMDA (Madagascar)', 'SACEM', 'Autre'];
const ROLES = ['Auteur', 'Compositeur', 'Parolier', 'Auteur-Compositeur', 'Interprète'];

type Writer = { name: string; role: string; share: string };
type MusicObj = Record<string, unknown>;

const inp: React.CSSProperties = { width: '100%', padding: '11px 12px', borderRadius: 10, border: '1px solid #E7E9EC', background: '#F4F5F7', fontSize: 14, color: INK, boxSizing: 'border-box', outline: 'none' };
const lbl: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: '#6A7585', margin: '0 0 4px 2px' };

function clean(o: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) {
    if (v == null || v === '' || v === false) continue;
    if (Array.isArray(v) && v.length === 0) continue;
    out[k] = v;
  }
  return out;
}
const csv = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);

// Composants présentationnels au NIVEAU MODULE (pas dans le composant) — sinon ils seraient
// recréés à chaque rendu → l'<input> serait démonté/remonté à chaque frappe = perte de focus.
function Field({ label: l, value, set, ph, type }: { label: string; value: string; set: (v: string) => void; ph?: string; type?: string }) {
  return <div><div style={lbl}>{l}</div><input style={inp} value={value} placeholder={ph} type={type || 'text'} onChange={(e) => set(e.target.value)} /></div>;
}
function FRow({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>{children}</div>;
}
function Section({ emoji, title, sub, children }: { emoji: string; title: string; sub: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 22 }}>
      <h3 style={{ fontFamily: "'Outfit',sans-serif", fontSize: 15, fontWeight: 800, color: INK, margin: '0 0 2px' }}>{emoji} {title}</h3>
      <p style={{ fontSize: 12, color: '#8A929B', margin: '0 0 10px' }}>{sub}</p>
      <div style={{ display: 'grid', gap: 10 }}>{children}</div>
    </section>
  );
}
function Toggle({ label: l, on, set }: { label: string; on: boolean; set: (v: boolean) => void }) {
  return (
    <button type="button" onClick={() => set(!on)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '11px 12px', borderRadius: 10, border: `1px solid ${on ? 'rgba(255,127,17,.4)' : '#E7E9EC'}`, background: on ? 'rgba(255,127,17,.10)' : '#F4F5F7', cursor: 'pointer', fontSize: 13.5, color: INK, fontWeight: 600 }}>
      <span>{l}</span><span style={{ width: 40, height: 22, borderRadius: 999, background: on ? '#FF7F11' : '#CBD2D9', position: 'relative', flexShrink: 0 }}><span style={{ position: 'absolute', top: 2, left: on ? 20 : 2, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left .15s' }} /></span>
    </button>
  );
}

export default function MusicMetaSheet({
  initial, onClose, onSave,
}: { initial?: MusicObj | null; onClose: () => void; onSave: (music: MusicObj | null) => void }) {
  const im = (initial || {}) as { work?: Record<string, unknown>; recording?: Record<string, unknown>; release?: Record<string, unknown>; rights?: Record<string, unknown>; ids?: Record<string, unknown> };
  const w0 = im.work || {}, r0 = im.recording || {}, rel0 = im.release || {}, ri0 = im.rights || {}, id0 = im.ids || {};
  const S = (v: unknown) => (v == null ? '' : String(v));

  // Œuvre
  const [wTitle, setWTitle] = useState(S(w0.title)); const [wVersion, setWVersion] = useState(S(w0.version));
  const [wIswc, setWIswc] = useState(S(w0.iswc)); const [wLang, setWLang] = useState(S(w0.language));
  const [wGenre, setWGenre] = useState(S(w0.genre)); const [wSub, setWSub] = useState(S(w0.subgenre));
  const [writers, setWriters] = useState<Writer[]>(Array.isArray(w0.writers) ? (w0.writers as Record<string, unknown>[]).map((x) => ({ name: S(x.name), role: S(x.role), share: S(x.share) })) : []);
  // Enregistrement
  const [isrc, setIsrc] = useState(S(r0.isrc)); const [artistMain, setArtistMain] = useState(S(r0.artist_main));
  const [featured, setFeatured] = useState(Array.isArray(r0.featured) ? (r0.featured as string[]).join(', ') : '');
  const [producers, setProducers] = useState(Array.isArray(r0.producers) ? (r0.producers as string[]).join(', ') : '');
  const [mix, setMix] = useState(S(r0.mix)); const [master, setMaster] = useState(S(r0.master));
  const [engineer, setEngineer] = useState(S(r0.engineer)); const [duration, setDuration] = useState(S(r0.duration));
  const [format, setFormat] = useState(S(r0.format)); const [sampleRate, setSampleRate] = useState(S(r0.sample_rate));
  const [country, setCountry] = useState(S(r0.country)); const [explicit, setExplicit] = useState(r0.explicit === true);
  // Sortie
  const [relType, setRelType] = useState(S(rel0.type)); const [relTitle, setRelTitle] = useState(S(rel0.title));
  const [upc, setUpc] = useState(S(rel0.upc)); const [ean, setEan] = useState(S(rel0.ean));
  const [trackNo, setTrackNo] = useState(S(rel0.track_no)); const [relDate, setRelDate] = useState(S(rel0.release_date));
  const [label, setLabel] = useState(S(rel0.label)); const [distributor, setDistributor] = useState(S(rel0.distributor));
  const [territories, setTerritories] = useState(Array.isArray(rel0.territories) ? (rel0.territories as string[]).join(', ') : '');
  // Droits
  const [masterOwner, setMasterOwner] = useState(S(ri0.master_owner)); const [compOwner, setCompOwner] = useState(S(ri0.composition_owner));
  const [cmo, setCmo] = useState(S(ri0.cmo)); const [cmoId, setCmoId] = useState(S(ri0.cmo_id));
  const [copyC, setCopyC] = useState(S(ri0.copyright_c)); const [copyP, setCopyP] = useState(S(ri0.copyright_p));
  const [samples, setSamples] = useState(ri0.samples_cleared === true); const [aiCleared, setAiCleared] = useState(ri0.ai_cleared === true);
  const [ownership, setOwnership] = useState(ri0.ownership_declared === true);
  // Identifiants
  const [extDist, setExtDist] = useState(S(id0.ext_dist));

  function save() {
    const work = clean({
      title: wTitle.trim(), version: wVersion.trim(), iswc: wIswc.trim(), language: wLang,
      genre: wGenre.trim(), subgenre: wSub.trim(),
      writers: writers.filter((w) => w.name.trim()).map((w) => clean({ name: w.name.trim(), role: w.role, share: w.share ? parseFloat(w.share.replace(',', '.')) : undefined })),
    });
    const recording = clean({
      isrc: isrc.trim().toUpperCase(), artist_main: artistMain.trim(), featured: csv(featured), producers: csv(producers),
      mix: mix.trim(), master: master.trim(), engineer: engineer.trim(), duration: duration.trim(),
      country: country.trim(), explicit: explicit || undefined, format: format.trim(), sample_rate: sampleRate.trim(),
    });
    const release = clean({
      type: relType, title: relTitle.trim(), upc: upc.trim(), ean: ean.trim(),
      track_no: trackNo ? parseInt(trackNo, 10) : undefined, label: label.trim(), distributor: distributor.trim(),
      release_date: relDate.trim(), territories: csv(territories),
    });
    const rights = clean({
      master_owner: masterOwner.trim(), composition_owner: compOwner.trim(),
      cmo: cmo === 'Aucune' ? '' : cmo, cmo_id: cmoId.trim(), copyright_c: copyC.trim(), copyright_p: copyP.trim(),
      samples_cleared: samples || undefined, ai_cleared: aiCleared || undefined, ownership_declared: ownership || undefined,
    });
    const ids = clean({ ext_dist: extDist.trim() });
    const music = clean({ work, recording, release, rights, ids });
    onSave(Object.keys(music).length ? music : null);
    onClose();
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 80, background: '#fff', display: 'flex', flexDirection: 'column' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderBottom: '1px solid #EDF0F4', position: 'sticky', top: 0, background: '#fff' }}>
        <button type="button" onClick={onClose} aria-label="Fermer" style={{ width: 36, height: 36, borderRadius: 999, border: 0, background: '#F1F2F4', display: 'grid', placeItems: 'center', cursor: 'pointer' }}><X className="w-5 h-5" /></button>
        <h2 style={{ fontFamily: "'Outfit',sans-serif", fontSize: 16, fontWeight: 800, color: INK, margin: 0 }}>Métadonnées de distribution</h2>
      </header>

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px calc(env(safe-area-inset-bottom) + 90px)', maxWidth: 620, margin: '0 auto', width: '100%' }}>
        <Section emoji="📀" title="Œuvre (composition)" sub="La chanson elle-même — identifiant ISWC.">
          <Field label="Titre du morceau" value={wTitle} set={setWTitle} />
          <Field label="Version (remix, live, acoustique, radio edit…)" value={wVersion} set={setWVersion} />
          <FRow>
            <Field label="ISWC (si existant)" value={wIswc} set={setWIswc} />
            <div><div style={lbl}>Langue</div><select style={inp} value={wLang} onChange={(e) => setWLang(e.target.value)}><option value="">—</option>{LANGS.map((l) => <option key={l} value={l}>{l}</option>)}</select></div>
          </FRow>
          <FRow><Field label="Genre" value={wGenre} set={setWGenre} /><Field label="Sous-genre" value={wSub} set={setWSub} /></FRow>
          <div>
            <div style={lbl}>Auteurs / compositeurs</div>
            <div style={{ display: 'grid', gap: 8 }}>
              {writers.map((w, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 60px 34px', gap: 6, alignItems: 'center' }}>
                  <input style={{ ...inp, padding: '9px 10px' }} placeholder="Nom" value={w.name} onChange={(e) => setWriters((a) => a.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} />
                  <select style={{ ...inp, padding: '9px 10px' }} value={w.role} onChange={(e) => setWriters((a) => a.map((x, j) => j === i ? { ...x, role: e.target.value } : x))}><option value="">Rôle</option>{ROLES.map((r) => <option key={r} value={r}>{r}</option>)}</select>
                  <input style={{ ...inp, padding: '9px 10px' }} placeholder="%" inputMode="numeric" value={w.share} onChange={(e) => setWriters((a) => a.map((x, j) => j === i ? { ...x, share: e.target.value } : x))} />
                  <button type="button" onClick={() => setWriters((a) => a.filter((_, j) => j !== i))} style={{ border: 0, background: 'none', cursor: 'pointer', color: '#9AA3AF' }}><Trash2 className="w-[18px] h-[18px]" /></button>
                </div>
              ))}
              <button type="button" onClick={() => setWriters((a) => [...a, { name: '', role: '', share: '' }])} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: 0, background: 'none', color: '#FF7F11', fontWeight: 800, fontSize: 13, cursor: 'pointer', padding: '2px 0', justifySelf: 'start' }}><Plus className="w-4 h-4" /> Ajouter un auteur</button>
            </div>
          </div>
        </Section>

        <Section emoji="🎙️" title="Enregistrement (master)" sub="Cette version enregistrée — identifiant ISRC.">
          <Field label="ISRC (si existant — sinon attribué par le distributeur)" value={isrc} set={setIsrc} />
          <Field label="Artiste principal" value={artistMain} set={setArtistMain} />
          <Field label="Artistes invités (feat.) — séparés par des virgules" value={featured} set={setFeatured} />
          <Field label="Producteur(s) — séparés par des virgules" value={producers} set={setProducers} />
          <FRow><Field label="Mixage" value={mix} set={setMix} /><Field label="Mastering" value={master} set={setMaster} /></FRow>
          <FRow><Field label="Ingénieur du son" value={engineer} set={setEngineer} /><Field label="Durée (mm:ss)" value={duration} set={setDuration} /></FRow>
          <FRow><Field label="Format (WAV, MP3…)" value={format} set={setFormat} /><Field label="Échantillonnage (44.1kHz…)" value={sampleRate} set={setSampleRate} /></FRow>
          <Field label="Pays d'origine" value={country} set={setCountry} />
          <Toggle label="Contenu explicite" on={explicit} set={setExplicit} />
        </Section>

        <Section emoji="💿" title="Sortie commerciale" sub="Le single/EP/album — identifiant UPC/EAN.">
          <div><div style={lbl}>Type de sortie</div><select style={inp} value={relType} onChange={(e) => setRelType(e.target.value)}><option value="">—</option>{REL_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
          <Field label="Nom de l'album / du projet" value={relTitle} set={setRelTitle} />
          <FRow><Field label="UPC" value={upc} set={setUpc} /><Field label="EAN" value={ean} set={setEan} /></FRow>
          <FRow><Field label="N° de piste" value={trackNo} set={setTrackNo} type="number" /><Field label="Date de sortie souhaitée" value={relDate} set={setRelDate} type="date" /></FRow>
          <FRow><Field label="Label" value={label} set={setLabel} /><Field label="Distributeur" value={distributor} set={setDistributor} /></FRow>
          <Field label="Territoires autorisés (ex : Monde, ou FR, MG…)" value={territories} set={setTerritories} />
        </Section>

        <Section emoji="⚖️" title="Droits" sub="Qui possède quoi — indispensable pour distribuer légalement.">
          <Field label="Titulaire des droits sur l'enregistrement (master)" value={masterOwner} set={setMasterOwner} />
          <Field label="Titulaire des droits sur la composition" value={compOwner} set={setCompOwner} />
          <FRow>
            <div><div style={lbl}>Société de gestion</div><select style={inp} value={cmo} onChange={(e) => setCmo(e.target.value)}><option value="">—</option>{CMOS.map((c) => <option key={c} value={c}>{c}</option>)}</select></div>
            <Field label="N° adhérent" value={cmoId} set={setCmoId} />
          </FRow>
          <FRow><Field label="© (composition)" value={copyC} set={setCopyC} /><Field label="℗ (enregistrement)" value={copyP} set={setCopyP} /></FRow>
          <Toggle label="Samples utilisés autorisés" on={samples} set={setSamples} />
          <Toggle label="Voix synthétiques / clonées autorisées" on={aiCleared} set={setAiCleared} />
          <Toggle label="Je déclare détenir les droits" on={ownership} set={setOwnership} />
        </Section>

        <Section emoji="🔖" title="Identifiants" sub="ISWC (œuvre), ISRC (enregistrement) et UPC sont ci-dessus. Ajoute un identifiant distributeur externe si tu en as un.">
          <Field label="Identifiant distributeur externe (Ditto…)" value={extDist} set={setExtDist} />
        </Section>
      </div>

      <div style={{ position: 'sticky', bottom: 0, background: '#fff', borderTop: '1px solid #EDF0F4', padding: '12px 16px calc(env(safe-area-inset-bottom) + 12px)' }}>
        <button type="button" onClick={save} style={{ width: '100%', height: 50, borderRadius: 14, border: 0, background: '#FF7F11', color: '#fff', fontFamily: "'Outfit',sans-serif", fontWeight: 800, fontSize: 15.5, cursor: 'pointer' }}>Enregistrer les métadonnées</button>
      </div>
    </div>
  );
}
