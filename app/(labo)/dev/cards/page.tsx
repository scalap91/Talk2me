'use client';

/**
 * /dev/cards — Inspecteur de cards (Pascal 2026-07-03).
 * Mode développeur : liste TES cards du moteur, ouvre le `.card` brut de chacune.
 * « le moteur crée les cards, les lecteurs les lisent » — ici tu es le lecteur.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDevMode, setDevMode, useIsAdmin } from '@/components/dev/CardDevButton';

type CardMeta = {
  id: string;
  title: string;
  types: string[];
  channel: string | null;
  state: string | null;
  owner: string | null;
  createdAt: number | null;
  path: string | null;
};
type Resp = { total: number; owner: string; scope: string; cards: CardMeta[] };

export default function DevCardsPage() {
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);
  const [all, setAll] = useState(false);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [raw, setRaw] = useState<Record<string, string>>({});
  const devOn = useDevMode();
  const admin = useIsAdmin();

  const load = useCallback(() => {
    setLoading(true);
    fetch('/api/dev/cards' + (all ? '?all=1' : ''), { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [all]);
  useEffect(() => { load(); }, [load]);

  const inspect = async (id: string) => {
    if (open === id) { setOpen(null); return; }
    setOpen(id);
    if (!raw[id]) {
      const t = await fetch('/api/card-file/' + id, { cache: 'no-store' }).then((r) => r.text()).catch(() => '(erreur de lecture)');
      setRaw((p) => ({ ...p, [id]: t }));
    }
  };

  const cards = useMemo(() => {
    const list = data?.cards ?? [];
    const lc = q.trim().toLowerCase();
    if (!lc) return list;
    return list.filter((c) =>
      c.id.toLowerCase().includes(lc) ||
      c.title.toLowerCase().includes(lc) ||
      c.types.join(' ').toLowerCase().includes(lc) ||
      (c.channel ?? '').toLowerCase().includes(lc)
    );
  }, [data, q]);

  if (!admin) {
    return (
      <div style={{ minHeight: '100dvh', background: '#0b0c10', color: '#8b93a7', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 24, fontFamily: 'ui-monospace,Menlo,monospace' }}>
        🔒 Inspecteur de cards réservé aux administrateurs.
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100dvh', background: '#0b0c10', color: '#e7eaf0', fontFamily: 'ui-monospace,SFMono-Regular,Menlo,monospace', padding: '16px 14px 60px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <span style={{ fontSize: 22 }}>🔍</span>
        <h1 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>Inspecteur de cards</h1>
      </div>
      <p style={{ fontSize: 12, color: '#8b93a7', margin: '0 0 14px' }}>
        Le moteur crée les cards · tu es le lecteur. Chaque ligne = une card du moteur ; clique pour lire son <b>.card</b> brut.
      </p>

      <button
        onClick={() => setDevMode(!devOn)}
        style={{
          width: '100%', boxSizing: 'border-box', marginBottom: 14, padding: '12px 14px', borderRadius: 12, cursor: 'pointer',
          textAlign: 'left', fontFamily: 'inherit', fontSize: 13, fontWeight: 700,
          border: '1px solid ' + (devOn ? '#2b5e3a' : '#262a35'),
          background: devOn ? 'rgba(124,255,164,.10)' : '#14161d',
          color: devOn ? '#7cffa4' : '#c8d0e0',
        }}
      >
        {devOn ? '● Mode développeur ACTIVÉ' : '○ Mode développeur désactivé'}
        <span style={{ display: 'block', fontSize: 11, fontWeight: 500, color: '#8b93a7', marginTop: 3 }}>
          {devOn ? 'Chaque card du feed affiche « 🔍 dev » → clic → son .card.' : 'Active-le → un bouton « 🔍 dev » apparaît sur CHAQUE card du feed.'}
        </span>
      </button>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
        <button onClick={() => setAll(false)} style={tab(!all)}>Mes cards</button>
        <button onClick={() => setAll(true)} style={tab(all)}>Toutes</button>
        <button onClick={load} style={{ ...tab(false), marginLeft: 'auto' }}>↻ Rafraîchir</button>
      </div>

      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="filtrer : id · titre · type · channel…"
        style={{ width: '100%', boxSizing: 'border-box', background: '#14161d', border: '1px solid #262a35', borderRadius: 10, color: '#e7eaf0', padding: '10px 12px', fontSize: 13, marginBottom: 14, outline: 'none' }}
      />

      <div style={{ fontSize: 12, color: '#8b93a7', marginBottom: 10 }}>
        {loading ? 'chargement…' : `${cards.length} card${cards.length > 1 ? 's' : ''}` + (data ? ` · total moteur : ${data.total} · scope : ${data.scope}` : '')}
      </div>

      {!loading && cards.length === 0 && (
        <div style={{ color: '#8b93a7', fontSize: 13, padding: 20, textAlign: 'center', border: '1px dashed #262a35', borderRadius: 12 }}>
          Aucune card dans le moteur pour ce scope. (Crée un post/plat/annonce → il apparaîtra ici.)
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {cards.map((c) => (
          <div key={c.id} style={{ border: '1px solid #262a35', borderRadius: 12, background: '#101219', overflow: 'hidden' }}>
            <button onClick={() => inspect(c.id)} style={{ width: '100%', textAlign: 'left', background: 'transparent', border: 'none', color: 'inherit', padding: '11px 12px', cursor: 'pointer' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{c.title || <span style={{ color: '#6b7280' }}>(sans titre)</span>}</span>
                <span style={{ marginLeft: 'auto', fontSize: 10.5, color: '#6b7280' }}>{c.id.slice(0, 8)}…</span>
              </div>
              <div style={{ marginTop: 6, fontSize: 10.5, color: '#7cffa4' }}>📁 {c.path || <span style={{ color: '#e06b6b' }}>inline (pas de fichier)</span>}</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                {c.types.map((t) => <span key={t} style={badge('#2d3350', '#aab4ff')}>{t}</span>)}
                {c.channel && <span style={badge('#2b3b2e', '#8fe6a4')}>{c.channel}</span>}
                {c.state && <span style={badge('#3a2b3e', '#e6a4d4')}>{c.state}</span>}
              </div>
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderTop: '1px solid #1c1f28' }}>
              <a
                href={'/api/card-file/' + c.id + '?download=1'}
                download={c.id + '.card'}
                onClick={(e) => e.stopPropagation()}
                style={{ fontSize: 12, fontWeight: 700, color: '#7cffa4', textDecoration: 'none' }}
              >
                ⬇ Télécharger le .card
              </a>
              <a
                href={'/api/card-file/' + c.id}
                target="_blank"
                rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
                style={{ fontSize: 12, color: '#8b93a7', textDecoration: 'none' }}
              >
                ↗ ouvrir
              </a>
            </div>
            {open === c.id && (
              <pre style={{ margin: 0, padding: 12, background: '#0a0b0f', borderTop: '1px solid #262a35', fontSize: 11.5, lineHeight: 1.5, color: '#c8d0e0', overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {raw[c.id] ?? 'lecture du .card…'}
              </pre>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function tab(active: boolean): React.CSSProperties {
  return {
    background: active ? '#fff' : '#14161d',
    color: active ? '#000' : '#c8d0e0',
    border: '1px solid ' + (active ? '#fff' : '#262a35'),
    borderRadius: 999, padding: '7px 13px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
  };
}
function badge(bg: string, fg: string): React.CSSProperties {
  return { background: bg, color: fg, borderRadius: 6, padding: '2px 7px', fontSize: 10.5, fontWeight: 700 };
}
