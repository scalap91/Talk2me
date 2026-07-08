'use client';

/**
 * Sélecteur de langue LECTEUR pour la page-entité (Pascal 2026-07-08).
 * L'article a UNE version canonique ; le lecteur choisit sa langue → ?lang=xx →
 * l'article est traduit à la volée (et mis en cache). Le mec à Singapour lit chez lui.
 */
const LANGS: [string, string][] = [
  ['fr', 'Français'],
  ['en', 'English'],
  ['es', 'Español'],
  ['pt', 'Português'],
  ['zh', '中文'],
  ['ar', 'العربية'],
  ['mg', 'Malagasy'],
  ['hi', 'हिन्दी'],
];

export default function LangSwitcher({ current }: { current: string }) {
  const value = LANGS.some((l) => l[0] === current) ? current : 'fr';
  function go(code: string) {
    const u = new URL(window.location.href);
    u.searchParams.set('lang', code);
    window.location.href = u.toString();
  }
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--t2m-ink-3)', fontSize: 13 }}>
      <span aria-hidden>🌐</span>
      <select
        aria-label="Langue de lecture"
        value={value}
        onChange={(e) => go(e.target.value)}
        style={{
          padding: '5px 8px',
          borderRadius: 9,
          border: '1px solid var(--t2m-line)',
          background: 'var(--t2m-paper)',
          color: 'var(--t2m-ink-2)',
          fontSize: 13,
          fontFamily: 'inherit',
        }}
      >
        {LANGS.map(([c, n]) => (
          <option key={c} value={c}>
            {n}
          </option>
        ))}
      </select>
    </div>
  );
}
