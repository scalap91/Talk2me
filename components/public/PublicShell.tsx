/**
 * Coquille des pages PUBLIQUES SEO (page-entité, boutique, profil). Pensée pour un
 * VISITEUR non connecté qui arrive de Google — PAS le chrome de l'app (Discussions/
 * Card/Profil = inutiles à un anonyme). Header léger (marque + CTA rejoindre) + footer
 * de maillage (liens publics). Rendue côté serveur, sans JS. Pascal 2026-07-08.
 */
import type { ReactNode } from 'react';

const FOOTER_LINKS = [
  { href: '/', label: 'Accueil' },
  { href: '/decouvrir', label: 'Explorer' },
  { href: '/legal', label: 'Mentions légales' },
  { href: '/infos/confidentialite', label: 'Confidentialité' },
];

export default function PublicShell({ children }: { children: ReactNode }) {
  return (
    <div style={{ minHeight: '100svh', background: 'var(--t2m-paper)', color: 'var(--t2m-ink)', display: 'flex', flexDirection: 'column' }}>
      {/* HEADER public : marque → landing + CTA rejoindre. */}
      <header
        style={{
          position: 'sticky', top: 0, zIndex: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 18px', background: 'color-mix(in srgb, var(--t2m-paper) 88%, transparent)',
          backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)', borderBottom: '1px solid var(--t2m-line)',
        }}
      >
        <a href="/" style={{ display: 'inline-flex', alignItems: 'baseline', gap: 1, textDecoration: 'none', fontFamily: "'Outfit',sans-serif", fontWeight: 800, fontSize: 19, color: 'var(--t2m-ink)' }}>
          Talk<span style={{ color: 'var(--t2m-primary)' }}>2</span>Me
        </a>
        <a
          href="/signin"
          style={{ padding: '8px 16px', borderRadius: 999, background: 'var(--t2m-primary)', color: '#fff', fontWeight: 700, fontSize: 13.5, textDecoration: 'none' }}
        >
          Rejoindre
        </a>
      </header>

      <main style={{ flex: 1 }}>{children}</main>

      {/* FOOTER de maillage : liens publics (crawl + le visiteur explore). */}
      <footer style={{ borderTop: '1px solid var(--t2m-line)', padding: '22px 18px 34px', color: 'var(--t2m-ink-3)', fontSize: 13 }}>
        <nav style={{ display: 'flex', flexWrap: 'wrap', gap: '10px 18px', marginBottom: 12 }}>
          {FOOTER_LINKS.map((l) => (
            <a key={l.href} href={l.href} style={{ color: 'var(--t2m-ink-2)', textDecoration: 'none' }}>{l.label}</a>
          ))}
        </nav>
        <p style={{ margin: 0 }}>
          © {new Date().getFullYear()} <strong style={{ color: 'var(--t2m-ink-2)' }}>Talk2Me</strong> — le marché du peuple · le web qui comprend ta conversation.
        </p>
      </footer>
    </div>
  );
}
