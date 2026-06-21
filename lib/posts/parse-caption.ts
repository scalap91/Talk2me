/**
 * Talk2Me — Parseur UNIQUE du texte de post (Pascal 2026-06-21).
 * UNE seule string (caption/text) → { titre, description, hashtags, tags }.
 * Convention : 1re ligne = titre ; lignes `#…` = hashtags ; lignes `@…` = tags ;
 * le reste = description. À utiliser PARTOUT (fini les 3 parseurs divergents).
 */
export interface ParsedPost {
  title: string;
  description: string;
  hashtags: string;
  tags: string;
}

export function parseCaption(caption: string | null | undefined): ParsedPost {
  if (!caption) return { title: '', description: '', hashtags: '', tags: '' };
  const lines = caption.split('\n');
  const title = lines[0] || '';
  const hashtagLines: string[] = [];
  const tagLines: string[] = [];
  const descLines: string[] = [];
  for (const line of lines.slice(1)) {
    const t = line.trim();
    if (!t) continue;
    if (t.startsWith('#')) hashtagLines.push(t);
    else if (t.startsWith('@')) tagLines.push(t);
    else descLines.push(t);
  }
  return {
    title,
    description: descLines.join('\n'),
    hashtags: hashtagLines.join(' '),
    tags: tagLines.join(' '),
  };
}
