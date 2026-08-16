'use client';

/**
 * Talk2Me — PAGES LIÉES (M7 ph.2, Pascal 2026-07-08). Léa propose les entités citées
 * dans l'article (avec leur VRAI clip trouvé) → l'humain VALIDE → crée la page-entité liée.
 * Le graphe se construit à la main-levée humaine, groundé (clip trouvé, jamais inventé).
 */
import { useState } from 'react';
import GetAppSheet from '@/components/public/GetAppSheet';

interface Found {
  videoId: string;
  title: string;
  channel: string;
  thumbnail: string;
}
interface Candidate {
  name: string;
  type: string;
  found: Found | null;
}

export default function LinkedEntities({ cardId }: { cardId: string }) {
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState<string | null>(null);
  const [created, setCreated] = useState<Record<string, string>>({});
  const [getApp, setGetApp] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  function flash(m: string) {
    setToast(m);
    setTimeout(() => setToast(null), 2400);
  }

  async function suggest() {
    if (loading) return;
    setLoading(true);
    try {
      const r = await fetch(`/api/cards/${cardId}/enrich`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'suggest-links' }),
      });
      if (r.status === 401) {
        setGetApp(true);
        return;
      }
      if (r.ok) setCandidates((await r.json()).candidates || []);
    } catch {
      /* silencieux */
    } finally {
      setLoading(false);
    }
  }

  async function create(c: Candidate) {
    if (!c.found || creating) return;
    setCreating(c.name);
    try {
      const r = await fetch(`/api/cards/${cardId}/enrich`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create-link',
          name: c.name,
          videoId: c.found.videoId,
          title: c.found.title,
          channel: c.found.channel,
        }),
      });
      if (r.status === 401) {
        setGetApp(true);
        return;
      }
      if (r.ok) {
        const j = await r.json();
        setCreated((p) => ({ ...p, [c.name]: j.path }));
        flash('Page liée créée ✅');
      }
    } catch {
      /* silencieux */
    } finally {
      setCreating(null);
    }
  }

  const creatable = (candidates || []).filter((c) => c.found);

  return (
    <section style={{ maxWidth: 720, margin: '0 auto', padding: '4px 18px 8px' }}>
      <h2 style={{ fontFamily: "'Outfit',sans-serif", fontSize: 18, fontWeight: 800, margin: '0 0 4px', color: 'var(--t2m-ink)' }}>
        Pages liées
      </h2>
      <p style={{ fontSize: 13, color: 'var(--t2m-ink-3)', margin: '0 0 12px' }}>
        Les sujets cités ici peuvent avoir leur propre page. L’IA trouve le vrai clip, tu valides.
      </p>

      {candidates === null ? (
        <button
          type="button"
          onClick={suggest}
          disabled={loading}
          style={{
            padding: '11px 20px', borderRadius: 12, border: '1px solid var(--t2m-line)', background: 'var(--t2m-paper)',
            color: 'var(--t2m-ink)', fontWeight: 700, fontSize: 14.5, cursor: loading ? 'default' : 'pointer',
          }}
        >
          {loading ? '… l’IA cherche' : '🔗 Suggérer des pages liées'}
        </button>
      ) : creatable.length === 0 ? (
        <p style={{ fontSize: 14, color: 'var(--t2m-ink-3)', margin: 0 }}>Aucune entité liée avec un clip trouvé.</p>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: 12 }}>
          {creatable.map((c) => (
            <li
              key={c.name}
              style={{ border: '1px solid var(--t2m-line)', borderRadius: 14, overflow: 'hidden', background: 'var(--t2m-paper)' }}
            >
              {c.found!.thumbnail && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={c.found!.thumbnail} alt="" style={{ width: '100%', aspectRatio: '16/9', objectFit: 'cover' }} />
              )}
              <div style={{ padding: '10px 12px' }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--t2m-ink)', lineHeight: 1.25 }}>{c.name}</div>
                <div style={{ fontSize: 12, color: 'var(--t2m-ink-3)', margin: '2px 0 10px', display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                  {c.found!.title}
                </div>
                {created[c.name] ? (
                  <a href={created[c.name]} style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--t2m-primary)', textDecoration: 'none' }}>
                    Voir la page →
                  </a>
                ) : (
                  <button
                    type="button"
                    onClick={() => create(c)}
                    disabled={creating === c.name}
                    style={{
                      padding: '8px 14px', borderRadius: 10, border: 'none', background: 'var(--t2m-primary)', color: '#fff',
                      fontWeight: 800, fontSize: 13.5, cursor: creating === c.name ? 'default' : 'pointer', opacity: creating === c.name ? 0.6 : 1,
                    }}
                  >
                    {creating === c.name ? 'Création…' : 'Créer la page'}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {toast && (
        <div
          role="status"
          style={{
            position: 'fixed', left: '50%', bottom: 24, transform: 'translateX(-50%)', background: 'var(--t2m-ink)',
            color: '#fff', padding: '11px 18px', borderRadius: 12, fontSize: 14, fontWeight: 600,
            boxShadow: '0 8px 30px rgba(0,0,0,0.18)', zIndex: 50,
          }}
        >
          {toast}
        </div>
      )}

      <GetAppSheet open={getApp} onClose={() => setGetApp(false)} context="join" />
    </section>
  );
}
