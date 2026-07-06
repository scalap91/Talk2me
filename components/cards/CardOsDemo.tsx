'use client';
/**
 * CardOsDemo — preuve du moteur SuperCard (Card OS, Pascal 2026-06-30).
 * Montre : 1 fichier .card → rendu par le MOTEUR UNIQUE (mini/normal/full) ;
 * ENVOYER un .card (télécharger/partager) ; RECEVOIR un .card (coller ou ouvrir une URL).
 */
import { useState } from 'react';
import { parseCard, serializeCard, type SuperCard } from '@/lib/cards/supercard';
import SuperCardView from '@/components/cards/SuperCardView';

function download(card: SuperCard) {
  const blob = new Blob([serializeCard(card)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `${card.id}.card`;
  a.click(); URL.revokeObjectURL(url);
}

export default function CardOsDemo({ samples }: { samples: { name: string; text: string }[] }) {
  const parsed = samples.map((s) => ({ name: s.name, res: parseCard(s.text) }));

  // Reçu (collé ou via URL)
  const [received, setReceived] = useState<SuperCard | null>(null);
  const [pasteVal, setPasteVal] = useState('');
  const [urlVal, setUrlVal] = useState('/cards/demo-clio.card');
  const [err, setErr] = useState<string | null>(null);

  function receivePaste() {
    setErr(null);
    const r = parseCard(pasteVal);
    if (r.ok && r.card) setReceived(r.card); else setErr(r.reason || 'illisible');
  }
  async function receiveUrl() {
    setErr(null);
    try {
      const text = await fetch(urlVal).then((x) => x.text());
      const r = parseCard(text);
      if (r.ok && r.card) setReceived(r.card); else setErr(r.reason || 'illisible');
    } catch { setErr('url_injoignable'); }
  }

  return (
    <div className="space-y-6">
      {/* 1 fichier .card → 3 niveaux de lecture par le MÊME moteur */}
      {parsed.map(({ name, res }) => (
        <section key={name} className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
          <div className="flex items-center justify-between gap-2 mb-3">
            <code className="text-[12px] text-fuchsia-200/80">/cards/{name}</code>
            {res.ok && res.card && (
              <div className="flex gap-2">
                <a href={`/cards/${name}`} target="_blank" rel="noreferrer" className="text-[12px] rounded-lg bg-white/[0.06] border border-white/12 px-2.5 py-1 hover:bg-white/[0.12]">Ouvrir le fichier</a>
                <button onClick={() => download(res.card!)} className="text-[12px] rounded-lg bg-sky-500/20 border border-sky-400/30 text-sky-200 px-2.5 py-1 hover:bg-sky-500/30">📤 Envoyer (.card)</button>
              </div>
            )}
          </div>
          {!res.ok ? (
            <p className="text-[12.5px] text-red-300">Fichier illisible : {res.reason}</p>
          ) : (
            <div className="flex flex-wrap items-start gap-4">
              <div><div className="text-[10.5px] text-white/40 mb-1">mini (Feed)</div><SuperCardView card={res.card!} level="mini" /></div>
              <div><div className="text-[10.5px] text-white/40 mb-1">normal (Boutique)</div><SuperCardView card={res.card!} level="normal" /></div>
              <div><div className="text-[10.5px] text-white/40 mb-1">full (détail)</div><SuperCardView card={res.card!} level="full" /></div>
            </div>
          )}
        </section>
      ))}

      {/* RECEVOIR un .card */}
      <section className="rounded-2xl border border-emerald-400/20 bg-emerald-500/[0.05] p-4">
        <h2 className="text-[13px] uppercase tracking-wider text-white/45 mb-3">📥 Recevoir un .card</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <div className="text-[11.5px] text-white/55 mb-1">Coller le contenu d&apos;un .card</div>
            <textarea value={pasteVal} onChange={(e) => setPasteVal(e.target.value)} rows={4}
              placeholder='{ "format": "t2m.card", ... }'
              className="w-full bg-[#0c0e14] border border-white/12 rounded-lg p-2 text-[11px] font-mono text-white/80 outline-none focus:border-white/30" />
            <button onClick={receivePaste} className="mt-2 text-[12px] rounded-lg bg-emerald-500/20 border border-emerald-400/30 text-emerald-200 px-2.5 py-1 hover:bg-emerald-500/30">Lire le .card collé</button>
          </div>
          <div>
            <div className="text-[11.5px] text-white/55 mb-1">…ou ouvrir une URL .card</div>
            <input value={urlVal} onChange={(e) => setUrlVal(e.target.value)}
              className="w-full bg-[#0c0e14] border border-white/12 rounded-lg p-2 text-[12px] text-white/80 outline-none focus:border-white/30" />
            <button onClick={receiveUrl} className="mt-2 text-[12px] rounded-lg bg-emerald-500/20 border border-emerald-400/30 text-emerald-200 px-2.5 py-1 hover:bg-emerald-500/30">Ouvrir l&apos;URL</button>
          </div>
        </div>
        {err && <p className="text-[12px] text-red-300 mt-2">⚠️ {err}</p>}
        {received && (
          <div className="mt-4">
            <div className="text-[11.5px] text-white/55 mb-2">Reçu &amp; rendu par le même moteur :</div>
            <SuperCardView card={received} level="full" />
          </div>
        )}
      </section>
    </div>
  );
}
