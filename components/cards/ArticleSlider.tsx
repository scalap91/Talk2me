'use client';

/**
 * Talk2Me — POST-SWIPER (Pascal 2026-07-08). Un SEUL swiper horizontal sur la card enrichie :
 * diapo 0 = le POST (l'image), puis on SWIPE À DROITE pour lire l'article découpé en sections.
 * Compact, une seule hauteur, points de progression. Tout reste dans le post (aucune page externe).
 */
import { useRef, useState } from 'react';

interface TextSlide {
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

/** Article → diapos texte (une par section). Sans titres → on découpe par budget de caractères. */
function toTextSlides(text: string): TextSlide[] {
  const slides: TextSlide[] = [];
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
  // Pas de sections (aucun titre) → un seul gros bloc : on le repagine par ~360 caractères.
  if (slides.length <= 1) {
    const whole = clean(text);
    const parts: TextSlide[] = [];
    const sentences = whole.split(/(?<=[.!?])\s+/);
    let buf = '';
    for (const s of sentences) {
      if ((buf + ' ' + s).length > 360 && buf) {
        parts.push({ heading: '', body: buf.trim() });
        buf = s;
      } else {
        buf = buf ? buf + ' ' + s : s;
      }
    }
    if (buf.trim()) parts.push({ heading: '', body: buf.trim() });
    return parts.length ? parts : [{ heading: '', body: whole }];
  }
  return slides;
}

export default function ArticleSlider({ text, cover }: { text: string; cover?: string | null }) {
  const textSlides = toTextSlides(text);
  const ref = useRef<HTMLDivElement | null>(null);
  const [active, setActive] = useState(0);
  const total = (cover ? 1 : 0) + textSlides.length;

  function onScroll() {
    const el = ref.current;
    if (!el) return;
    setActive(Math.round(el.scrollLeft / el.clientWidth));
  }

  if (total === 0) return null;

  const slideBase: React.CSSProperties = {
    flex: '0 0 100%',
    minWidth: 0,
    scrollSnapAlign: 'start',
    boxSizing: 'border-box',
  };

  return (
    <div style={{ margin: '0 0 4px' }}>
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
          aspectRatio: '4 / 5',
          background: '#eef1f5',
        }}
      >
        {cover && (
          <div style={{ ...slideBase, height: '100%' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={cover} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} loading="lazy" />
          </div>
        )}
        {textSlides.map((s, i) => (
          <article key={i} style={{ ...slideBase, height: '100%', overflowY: 'auto', background: 'var(--t2m-paper)', padding: '16px 16px' }}>
            {s.heading && (
              <h3 style={{ fontFamily: "'Outfit',sans-serif", fontSize: 16, fontWeight: 800, margin: '0 0 8px', color: 'var(--t2m-ink)' }}>
                {s.heading}
              </h3>
            )}
            <p style={{ fontSize: 14.5, lineHeight: 1.6, color: 'var(--t2m-ink)', margin: 0, whiteSpace: 'pre-wrap' }}>{s.body}</p>
          </article>
        ))}
      </div>

      {total > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 5, marginTop: 8 }}>
          {Array.from({ length: total }).map((_, i) => (
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
