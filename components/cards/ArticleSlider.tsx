'use client';

/**
 * Talk2Me — ARTICLE EN SLIDER (Pascal 2026-07-08). Le texte de l'article-entité arrive SUR
 * la card du feed, mais un article vertical géant plombe le feed → on le découpe en
 * DIAPOS horizontales (une par section) qu'on swipe sur le côté. Compact + vivant, tout
 * reste dans le post (aucune page externe). Thème clair (tokens --t2m-*).
 */
import { useRef, useState } from 'react';

interface Slide {
  heading: string;
  body: string;
}

function clean(s: string): string {
  return s
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .trim();
}
function isHeading(l: string): boolean {
  return /^\*\*(.+?)\*\*[:：]?$/.test(l) || /^#{1,6}\s+/.test(l);
}

/** Découpe l'article en diapos : une par section (titre + corps) ; l'intro = 1re diapo. */
function toSlides(text: string): Slide[] {
  const slides: Slide[] = [];
  let cur: { heading: string; body: string[] } = { heading: '', body: [] };
  const flush = () => {
    if (cur.heading || cur.body.length) slides.push({ heading: cur.heading, body: cur.body.join('\n') });
  };
  for (const raw of (text || '').split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    if (isHeading(line)) {
      flush();
      cur = { heading: clean(line.replace(/^#{1,6}\s+/, '')), body: [] };
    } else {
      cur.body.push(clean(line));
    }
  }
  flush();
  return slides.length ? slides : [{ heading: '', body: clean(text) }];
}

export default function ArticleSlider({ text }: { text: string }) {
  const slides = toSlides(text);
  const ref = useRef<HTMLDivElement | null>(null);
  const [active, setActive] = useState(0);

  function onScroll() {
    const el = ref.current;
    if (!el) return;
    setActive(Math.round(el.scrollLeft / el.clientWidth));
  }

  if (slides.length === 0) return null;

  return (
    <div style={{ margin: '4px 0 2px' }}>
      <div
        ref={ref}
        onScroll={onScroll}
        style={{
          display: 'flex',
          overflowX: 'auto',
          scrollSnapType: 'x mandatory',
          WebkitOverflowScrolling: 'touch',
          scrollbarWidth: 'none',
          borderRadius: 14,
        }}
      >
        {slides.map((s, i) => (
          <article
            key={i}
            style={{
              flex: '0 0 100%',
              minWidth: 0,
              scrollSnapAlign: 'start',
              boxSizing: 'border-box',
              padding: '2px 2px',
            }}
          >
            <div
              style={{
                height: 168,
                overflowY: 'auto',
                background: 'var(--t2m-wash)',
                border: '1px solid var(--t2m-line)',
                borderRadius: 14,
                padding: '12px 14px',
              }}
            >
              {s.heading && (
                <h3 style={{ fontFamily: "'Outfit',sans-serif", fontSize: 15, fontWeight: 800, margin: '0 0 6px', color: 'var(--t2m-ink)' }}>
                  {s.heading}
                </h3>
              )}
              <p style={{ fontSize: 14, lineHeight: 1.55, color: 'var(--t2m-ink)', margin: 0, whiteSpace: 'pre-wrap' }}>{s.body}</p>
            </div>
          </article>
        ))}
      </div>

      {slides.length > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 5, marginTop: 7 }}>
          {slides.map((_, i) => (
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
