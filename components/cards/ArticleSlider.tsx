'use client';

/**
 * Talk2Me — SWIPER POST ENRICHI (Pascal 2026-07-08). UN swiper : page(s) TEXTE à GAUCHE ↔ page
 * PHOTO à droite. Le texte est dans SA propre page (jamais posé sur l'image), SANS titre.
 * La photo est visible par défaut ; on swipe à gauche pour lire le texte. Un post = un écran.
 */
import { useRef, useState, useEffect } from 'react';

const CAP = 600; // caractères par page texte (page carrée bien remplie)

function clean(s: string): string {
  return s
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .trim();
}

/** Texte → pages équilibrées (parts égales, découpe sur les phrases). */
function toPages(text: string): string[] {
  const whole = clean(text);
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

export default function ArticleSlider({ text, imageUrl }: { text: string; title?: string | null; imageUrl?: string | null }) {
  const pages = toPages(text);
  const ref = useRef<HTMLDivElement | null>(null);
  const [active, setActive] = useState(0);
  const hasImg = !!imageUrl;
  const total = pages.length + (hasImg ? 1 : 0);

  // Ouvre sur la PHOTO (dernière page) : photo visible, texte À GAUCHE (on swipe pour le lire).
  useEffect(() => {
    const el = ref.current;
    if (el && hasImg) {
      el.scrollLeft = el.scrollWidth;
      setActive(pages.length);
    }
  }, [hasImg, pages.length]);

  function onScroll() {
    const el = ref.current;
    if (!el) return;
    setActive(Math.round(el.scrollLeft / el.clientWidth));
  }

  if (total === 0) return null;

  const slide: React.CSSProperties = {
    flex: '0 0 100%',
    minWidth: 0,
    height: '100%',
    scrollSnapAlign: 'start',
    scrollSnapStop: 'always',
    boxSizing: 'border-box',
  };

  return (
    <div>
      <div
        ref={ref}
        onScroll={onScroll}
        style={{
          display: 'flex',
          overflowX: 'auto',
          overflowY: 'hidden',
          scrollSnapType: 'x mandatory',
          WebkitOverflowScrolling: 'touch',
          scrollbarWidth: 'none',
          aspectRatio: '1 / 1',
          borderRadius: 12,
          background: '#eef1f5',
        }}
      >
        {pages.map((p, i) => (
          <div key={i} style={{ ...slide, overflow: 'hidden', padding: 16, background: 'var(--t2m-paper)' }}>
            <span style={{ fontFamily: "'Inter',sans-serif", fontSize: 14, lineHeight: 1.55, color: 'var(--t2m-ink)', whiteSpace: 'pre-wrap' }}>{p}</span>
          </div>
        ))}
        {hasImg && (
          <div style={slide}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imageUrl || ''} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} loading="lazy" />
          </div>
        )}
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
