'use client';

/**
 * Talk2Me — LÉGENDE FEUILLETABLE (Pascal 2026-07-08). RÈGLE D'OR : un post = la taille de l'écran
 * du feed. Le texte de l'article tient donc dans une zone légende de HAUTEUR FIXE (comme une
 * légende normale), et comme il est long on le FEUILLETTE à droite (swipe) page par page — le post
 * ne grandit jamais. Titre sur la 1re page. Présentation standard, rien d'inventé.
 */
import { useRef, useState } from 'react';

const AREA_H = 116; // hauteur fixe de la zone légende (≈ 5 lignes) → le post reste à la taille de l'écran
const CAP = 230; // caractères par page (calé sur AREA_H pour remplir sans déborder)

function clean(s: string): string {
  return s
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .trim();
}

/** Texte → pages ÉQUILIBRÉES (parts égales, découpe sur les phrases) : pleines, pas de blanc. */
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

export default function ArticleSlider({ text, title }: { text: string; title?: string | null }) {
  const pages = toPages(text);
  const ref = useRef<HTMLDivElement | null>(null);
  const [active, setActive] = useState(0);

  function onScroll() {
    const el = ref.current;
    if (!el) return;
    setActive(Math.round(el.scrollLeft / el.clientWidth));
  }

  if (pages.length === 0) return null;
  const heading = (title || '').split(/(?<=[.!?])\s/)[0].trim(); // 1re phrase = titre

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
          height: AREA_H,
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
              <strong style={{ display: 'block', fontFamily: "'Outfit',sans-serif", fontSize: 15, fontWeight: 800, lineHeight: 1.25, color: 'var(--t2m-ink)', marginBottom: 3 }}>
                {heading}
              </strong>
            )}
            <span style={{ fontFamily: "'Inter',sans-serif", fontSize: 14, lineHeight: 1.5, color: 'var(--t2m-ink)', whiteSpace: 'pre-wrap' }}>{p}</span>
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
