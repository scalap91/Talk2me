'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * MODULE TEXTE PARTAGÉ du feed (Pascal 2026-07-12) — un SEUL rendu pour la légende d'un post,
 * appliqué à TOUTES les pages du feed. Deux exports :
 *   - `renderRichText(text)` : liens [txt](url), #hashtags (→ recherche), @mentions (→ profil /u/pseudo).
 *   - `<Caption>` : la légende avec DÉROULANT « … voir plus / voir moins » quand le texte est trop long
 *     (court par défaut, complet au tap, EN PLACE — pas de fenêtre). Dé-risque le « tout sur une ligne ».
 * Ne JAMAIS dupliquer cette logique ailleurs. Extraction hashtags/mentions = lib/search/metadata-map.
 */

const TOKEN_STYLE = { color: '#8ab4ff', fontWeight: 600 } as const;

/** Parse `text` → ReactNode (texte + tokens cliquables #/@ et liens markdown). */
export function renderRichText(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  // # et @ UNIQUEMENT en début de mot (lookbehind : pas collés après une lettre/chiffre) →
  // « email@x » ou « c#1 » ne sont PAS des tokens. Pascal 2026-07-12.
  const re = /\[([^\]]+)\]\(([^)]+)\)|(?<![\p{L}\p{N}_])(#[\p{L}\p{N}_]+)|(?<![\p{L}\p{N}_])(@[\p{L}\p{N}_]+)/gu;
  let last = 0, k = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1] !== undefined) {
      out.push(<a key={k++} href={m[2]} onClick={(e) => e.stopPropagation()} style={{ ...TOKEN_STYLE, textDecoration: 'underline', textUnderlineOffset: 2 }}>{m[1]}</a>);
    } else if (m[3] !== undefined) {
      out.push(<a key={k++} href={`/decouvrir?q=${encodeURIComponent(m[3])}`} onClick={(e) => e.stopPropagation()} style={TOKEN_STYLE}>{m[3]}</a>);
    } else if (m[4] !== undefined) {
      out.push(<a key={k++} href={`/u/${encodeURIComponent(m[4].slice(1))}`} onClick={(e) => e.stopPropagation()} style={TOKEN_STYLE}>{m[4]}</a>);
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/**
 * Légende repliable. Affichée sur `collapsedLines` ligne(s) par défaut ; si le texte déborde,
 * un « … voir plus » apparaît → déroule EN PLACE. `moreColor` = couleur du toggle (immersif = clair).
 */
export function Caption({
  text, style, collapsedLines = 2, moreColor = 'rgba(255,255,255,.72)',
}: {
  text?: string | null;
  style?: React.CSSProperties;
  collapsedLines?: number;
  moreColor?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);
  const ref = useRef<HTMLParagraphElement>(null);

  // Mesure au montage (état replié) : le texte dépasse-t-il collapsedLines ?
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setOverflowing(el.scrollHeight - el.clientHeight > 2);
  }, [text, collapsedLines]);

  if (!text) return null;

  const clamp: React.CSSProperties = expanded
    ? {}
    : { display: '-webkit-box', WebkitLineClamp: collapsedLines, WebkitBoxOrient: 'vertical', overflow: 'hidden' };

  return (
    <div>
      <p ref={ref} style={{ ...style, ...clamp, margin: style?.margin ?? 0, overflowWrap: 'anywhere', wordBreak: 'break-word', paddingRight: 10 }}>{renderRichText(text)}</p>
      {(overflowing || expanded) && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v); }}
          style={{ background: 'none', border: 'none', padding: '2px 0 0', color: moreColor, fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: "'Inter',sans-serif" }}
        >
          {expanded ? 'voir moins' : '… voir plus'}
        </button>
      )}
    </div>
  );
}
