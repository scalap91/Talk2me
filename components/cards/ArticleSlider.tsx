'use client';

/**
 * Talk2Me — FEUILLETEUR DE TEXTE (Pascal 2026-07-08). PRÉSENTATION STANDARD : le texte est en
 * BAS de l'image comme tous les autres posts (même style de légende). Ici on ne fait QUE
 * paginer ce texte en pages qu'on SWIPE horizontalement (le texte est long). Aucune présentation
 * inventée : pas d'encadré, pas d'image dedans, pas de titre incrusté — juste la légende feuilletable.
 */
import { useRef, useState } from 'react';

function clean(s: string): string {
  return s
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .trim();
}

/** Texte → pages ÉQUILIBRÉES (parts égales, découpe sur les phrases) : pages pleines, peu nombreuses. */
const CAP = 480; // caractères par page
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

export default function ArticleSlider({ text }: { text: string }) {
  const pages = toPages(text);
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
          alignItems: 'flex-start',
        }}
      >
        {pages.map((p, i) => (
          <p
            key={i}
            style={{
              flex: '0 0 100%',
              minWidth: 0,
              scrollSnapAlign: 'start',
              scrollSnapStop: 'always',
              margin: 0,
              fontFamily: "'Inter',sans-serif",
              fontSize: 14,
              lineHeight: 1.5,
              color: 'var(--t2m-ink)',
              whiteSpace: 'pre-wrap',
            }}
          >
            {p}
          </p>
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
