'use client';

/**
 * Talk2Me — SIGNATURE d'une page-entité (Pascal 2026-07-08).
 * Byline JOURNALISTIQUE en BAS de l'article (pas une carte « Contributeurs » en haut) :
 * « Par <créateur> · enrichi par <éditeurs> ». Ferme le bloc entité (vidéo+texte+signature).
 * L'OUTIL d'enrichissement est ailleurs (ContributionTools), séparé, en dessous.
 *
 * PII : n'affiche que display_name/username/avatar.
 */
import { useEffect, useState } from 'react';

interface Contributor {
  user_id: string;
  role: 'creator' | 'sharer' | 'editor';
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
}

function nameOf(u: { display_name: string | null; username: string | null }): string {
  return (u.display_name || u.username || 'Anonyme').trim();
}

/** « A », « A et B », « A, B et C » — énumération à la française. */
function joinNames(names: string[]): string {
  if (names.length === 0) return '';
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(', ')} et ${names[names.length - 1]}`;
}

export default function EntitySignature({ cardId }: { cardId: string }) {
  const [contributors, setContributors] = useState<Contributor[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch(`/api/cards/${cardId}/contributions`, { cache: 'no-store' });
        if (alive && r.ok) {
          const j = await r.json();
          setContributors(j.contributors || []);
        }
      } catch {
        /* silencieux */
      } finally {
        if (alive) setLoaded(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [cardId]);

  if (!loaded) return null;

  const creator = contributors.find((c) => c.role === 'creator') || contributors[0] || null;
  const editors = contributors.filter((c) => c.role === 'editor');
  const editorNames = joinNames(editors.map(nameOf));

  return (
    <div
      style={{
        borderTop: '1px solid var(--t2m-line)',
        marginTop: 28,
        paddingTop: 16,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
      }}
    >
      {creator?.avatar_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={creator.avatar_url} alt="" style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
      ) : creator ? (
        <span
          style={{
            width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
            background: 'var(--t2m-primary)', color: '#fff',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 16, fontWeight: 800,
          }}
        >
          {nameOf(creator).slice(0, 1).toUpperCase()}
        </span>
      ) : null}

      <div style={{ lineHeight: 1.4 }}>
        {creator ? (
          <div style={{ fontSize: 14.5, color: 'var(--t2m-ink)' }}>
            <span style={{ color: 'var(--t2m-ink-3)' }}>Par </span>
            <strong style={{ fontWeight: 700 }}>{nameOf(creator)}</strong>
          </div>
        ) : (
          <div style={{ fontSize: 14, color: 'var(--t2m-ink-2)' }}>
            Publié sur <strong style={{ fontWeight: 700 }}>Talk2Me</strong>
          </div>
        )}
        {editorNames && (
          <div style={{ fontSize: 12.5, color: 'var(--t2m-ink-3)', marginTop: 1, fontStyle: 'italic' }}>
            Enrichi par {editorNames}
          </div>
        )}
      </div>
    </div>
  );
}
