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
/**
 * Article → diapos texte PLEINES et ÉQUILIBRÉES. On vise ~1 page par CAP caractères, puis on
 * répartit le texte en parts égales (aucune page à moitié vide = pas de blanc, et le moins de
 * pages possible). Découpe sur les phrases pour ne jamais couper au milieu d'une idée.
 */
const CAP = 700; // caractères par page ≈ ce qui remplit la hauteur d'une diapo
function toTextSlides(text: string): TextSlide[] {
  const whole = clean(text);
  if (!whole) return [];
  const sentences = whole.split(/(?<=[.!?])\s+/).filter(Boolean);
  const nPages = Math.max(1, Math.ceil(whole.length / CAP));
  const target = Math.ceil(whole.length / nPages); // longueur cible par page (équilibrée)
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
  return (parts.length ? parts : [whole]).map((body) => ({ heading: '', body }));
}

export default function ArticleSlider({ text, cover, title }: { text: string; cover?: string | null; title?: string | null }) {
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
    scrollSnapStop: 'always', // s'arrête sur CHAQUE page, une par une (pas de saut multi-pages)
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
          <div style={{ ...slideBase, height: '100%', position: 'relative' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={cover} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} loading="lazy" />
            {title && (
              <div
                style={{
                  position: 'absolute', left: 0, right: 0, bottom: 0, padding: '40px 16px 16px',
                  background: 'linear-gradient(to top, rgba(0,0,0,.72), rgba(0,0,0,0))',
                }}
              >
                <h2 style={{ fontFamily: "'Outfit',sans-serif", fontSize: 20, fontWeight: 800, lineHeight: 1.2, color: '#fff', margin: 0, textShadow: '0 1px 6px rgba(0,0,0,.5)' }}>
                  {title}
                </h2>
              </div>
            )}
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
