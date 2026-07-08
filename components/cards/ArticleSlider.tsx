'use client';

/**
 * Talk2Me — LÉGENDE FEUILLETABLE (Pascal 2026-07-08). RÈGLE D'OR : un post = UN écran.
 * Conforme à l'artéfact hub-gemini.html (card = header → légende → média → actions). Le texte
 * de l'article est la LÉGENDE ; comme il est long, il ne descend PAS (interdit de dépasser
 * l'écran) → on le SCROLLE À DROITE, page par page. Hauteur en vh (tient l'écran). Titre sur la
 * 1re page, sans doublon. Rien d'inventé.
 */
import { useRef, useState } from 'react';

const AREA_VH = 34; // hauteur de la zone légende (vh) → image + texte tiennent un écran
const CAP = 700; // caractères par page (peu de pages, pleines)

function clean(s: string): string {
  return s
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .trim();
}
function firstSentence(s: string): string {
  return clean(s).split(/(?<=[.!?])\s/)[0].replace(/[.!?]+$/, '').trim();
}

/** Corps → pages équilibrées. Retire le titre répété en tête (dédoublonnage). */
function toPages(text: string, heading: string): string[] {
  let whole = clean(text);
  if (heading) {
    const h = heading.toLowerCase();
    if (whole.toLowerCase().startsWith(h)) whole = whole.slice(heading.length).replace(/^[\s.:—–-]+/, '').trim();
  }
  if (!whole) return [];
  const sentences = whole.split(/(?<=[.!?])\s+/).filter(Boolean);
  const nPages = Math.max(1, Math.ceil(whole.length / CAP));
  const target = Math.ceil(whole.length / nPages);
  const parts: string[] = [];
  let buf = '';
  for (const s of sentences) {
    if (buf.length >= target && buf) {
      parts.push(buf.trim());
      buf = s;
    } else {
      buf = buf ? buf + ' ' + s : s;
    }
  }
  if (buf.trim()) parts.push(buf.trim());
  return parts.length ? parts : [whole];
}

export default function ArticleSlider({ text, title, dark }: { text: string; title?: string | null; dark?: boolean }) {
  const heading = firstSentence(title || '');
  const ink = dark ? '#fff' : 'var(--t2m-ink)';
  const shadow = dark ? '0 1px 4px rgba(0,0,0,.6)' : undefined;
  const pages = toPages(text, heading);
  const ref = useRef<HTMLDivElement | null>(null);
  const [active, setActive] = useState(0);

  function onScroll() {
    const el = ref.current;
    if (!el) return;
    setActive(Math.round(el.scrollLeft / el.clientWidth));
  }

  if (pages.length === 0) return null;

  return (
    <div>
      <div
        ref={ref}
        onScroll={onScroll}
        style={{
          display: 'flex',
          overflowX: 'auto',
          scrollSnapType: 'x mandatory',
          WebkitOverflowScrolling: 'touch',
          scrollbarWidth: 'none',
          height: `${AREA_VH}vh`,
        }}
      >
        {pages.map((p, i) => (
          <div
            key={i}
            style={{
              flex: '0 0 100%',
              minWidth: 0,
              height: '100%',
              overflow: 'hidden',
              scrollSnapAlign: 'start',
              scrollSnapStop: 'always',
              boxSizing: 'border-box',
            }}
          >
            {i === 0 && heading && (
              <strong style={{ display: 'block', fontFamily: "'Outfit',sans-serif", fontSize: 16, fontWeight: 700, lineHeight: 1.3, color: ink, textShadow: shadow, marginBottom: 6 }}>
                {heading}
              </strong>
            )}
            <span style={{ fontFamily: "'Inter',sans-serif", fontSize: 14, lineHeight: 1.5, color: ink, textShadow: shadow, whiteSpace: 'pre-wrap' }}>{p}</span>
          </div>
        ))}
      </div>

      {pages.length > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 5, marginTop: 8 }}>
          {pages.map((_, i) => (
            <span
              key={i}
              style={{
                width: i === active ? 16 : 6,
                height: 6,
                borderRadius: 999,
                background: i === active ? 'var(--t2m-primary)' : 'var(--t2m-line)',
                transition: 'width .2s',
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
