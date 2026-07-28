/**
 * Page de SECOURS hors-ligne (Pascal 2026-07-28) — servie par le service worker (`/sw.js`)
 * UNIQUEMENT quand une navigation échoue faute de réseau. En ligne, on ne la voit jamais.
 */
export const dynamic = 'force-static';

export const metadata = { title: 'Hors ligne — Talk2Me' };

export default function OfflinePage() {
  return (
    <div
      style={{
        minHeight: '100dvh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 18, padding: 24,
        textAlign: 'center', background: '#0a0a14', color: '#fff',
        fontFamily: "'Outfit', system-ui, sans-serif",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/icons/icon-192.png" alt="Talk2Me" width={72} height={72} style={{ borderRadius: 18 }} />
      <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Tu es hors ligne</h1>
      <p style={{ fontSize: 14, color: '#9DAAB7', maxWidth: 320, lineHeight: 1.5, margin: 0 }}>
        Pas de connexion pour l’instant. Talk2Me revient dès que le réseau est là.
      </p>
      <a
        href="/"
        style={{
          marginTop: 6, display: 'inline-block', background: '#FF3344', color: '#fff',
          fontWeight: 700, fontSize: 15, padding: '11px 22px', borderRadius: 999, textDecoration: 'none',
        }}
      >
        Réessayer
      </a>
    </div>
  );
}
