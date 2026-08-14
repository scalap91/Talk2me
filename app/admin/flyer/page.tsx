'use client';

/**
 * Talk2Me — Carte des scans du prospectus (Pascal 2026-07-01).
 * Où le QR est scanné (géoloc précise ou ville par IP). Super-admin (API gated).
 * Leaflet chargé via CDN pour éviter une dépendance de build.
 */
import { useEffect, useRef, useState } from 'react';

interface Point { lat: number; lng: number; city: string | null; at: number }
interface Data { stats: { total: number; geoloc: number; byCity: { city: string; n: number }[] }; points: Point[] }

// Charge Leaflet (CSS + JS) une seule fois.
function loadLeaflet(): Promise<unknown> {
  interface W { L?: unknown; __leafletP?: Promise<unknown> }
  const w = window as unknown as W;
  if (w.L) return Promise.resolve(w.L);
  if (w.__leafletP) return w.__leafletP;
  w.__leafletP = new Promise((resolve) => {
    const css = document.createElement('link');
    css.rel = 'stylesheet'; css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(css);
    const js = document.createElement('script');
    js.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    js.onload = () => resolve((window as unknown as W).L);
    document.head.appendChild(js);
  });
  return w.__leafletP;
}

export default function FlyerMapPage() {
  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  // Générateur de QR prospectus : code campagne → URL d'invitation /r/<code> → QR PNG (/api/public/qr).
  const [code, setCode] = useState('flyer');
  const [origin, setOrigin] = useState('');
  const [copied, setCopied] = useState(false);
  useEffect(() => { try { setOrigin(window.location.origin); } catch { /* */ } }, []);
  const safeCode = (code || 'flyer').trim().replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40) || 'flyer';
  const inviteUrl = origin ? `${origin}/r/${safeCode}` : '';
  const qrSrc = inviteUrl ? `/api/public/qr?url=${encodeURIComponent(inviteUrl)}` : '';

  useEffect(() => {
    fetch('/api/admin/flyer', { cache: 'no-store' })
      .then((r) => r.ok ? r.json() : Promise.reject(r.status))
      .then((d) => setData(d))
      .catch((s) => setErr(s === 403 ? 'Accès réservé (super-admin).' : 'Erreur de chargement.'));
  }, []);

  useEffect(() => {
    if (!data || !mapRef.current || !data.points.length) return;
    let map: { remove: () => void } | null = null;
    loadLeaflet().then((L) => {
      // @ts-expect-error Leaflet chargé dynamiquement
      map = L.map(mapRef.current).setView([data.points[0].lat, data.points[0].lng], 6);
      // @ts-expect-error idem
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap', maxZoom: 18 }).addTo(map);
      for (const p of data.points) {
        // @ts-expect-error idem
        L.circleMarker([p.lat, p.lng], { radius: 5, color: '#22d3ee', fillColor: '#22d3ee', fillOpacity: 0.55, weight: 1 })
          .addTo(map).bindPopup((p.city || 'Position') + ' · ' + new Date(p.at).toLocaleDateString('fr'));
      }
    });
    return () => { try { map?.remove(); } catch { /* */ } };
  }, [data]);

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', color: '#e5e5e5', fontFamily: 'ui-sans-serif,system-ui', padding: 16, maxWidth: 900, margin: '0 auto' }}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>📍 Scans du prospectus</h1>
      <p style={{ color: '#888', fontSize: 13, marginBottom: 16 }}>Où T2M se répand — 1 QR, position au scan (géoloc précise ou ville par IP).</p>

      {/* GÉNÉRATEUR de QR prospectus : code campagne → URL /r/<code> → PNG via /api/public/qr. */}
      <div style={{ background: '#141414', border: '1px solid #222', borderRadius: 12, padding: 16, marginBottom: 20 }}>
        <h2 style={{ fontSize: 15, margin: '0 0 4px' }}>🖨️ Générer un prospectus</h2>
        <p style={{ color: '#888', fontSize: 12, margin: '0 0 12px' }}>Choisis un code de campagne (ex. <code>flyer</code>, <code>tana-mars</code>) → télécharge le QR → imprime-le. Chaque scan se pose sur la carte ci-dessous.</p>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div style={{ background: '#fff', borderRadius: 10, padding: 10, lineHeight: 0, flexShrink: 0 }}>
            {qrSrc
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={qrSrc} alt={`QR prospectus ${safeCode}`} width={180} height={180} style={{ display: 'block', width: 180, height: 180 }} />
              : <div style={{ width: 180, height: 180 }} />}
          </div>
          <div style={{ flex: 1, minWidth: 220, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <label style={{ fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: '.5px' }}>Code de campagne</label>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="flyer"
              style={{ background: '#0a0a0a', border: '1px solid #333', borderRadius: 8, padding: '9px 11px', color: '#e5e5e5', fontSize: 14, fontFamily: 'ui-monospace,monospace' }}
            />
            <div style={{ fontSize: 12, color: '#888', wordBreak: 'break-all' }}>Lien encodé : <span style={{ color: '#22d3ee' }}>{inviteUrl || '…'}</span></div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 2 }}>
              <a
                href={qrSrc || '#'}
                download={`prospectus-${safeCode}.png`}
                style={{ background: '#22d3ee', color: '#00323a', fontWeight: 700, fontSize: 13, padding: '9px 14px', borderRadius: 8, textDecoration: 'none' }}
              >⬇️ Télécharger le QR (PNG)</a>
              <button
                type="button"
                onClick={() => { try { navigator.clipboard.writeText(inviteUrl); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* */ } }}
                style={{ background: '#222', color: '#e5e5e5', fontSize: 13, padding: '9px 14px', borderRadius: 8, border: '1px solid #333', cursor: 'pointer' }}
              >{copied ? '✓ Copié' : '🔗 Copier le lien'}</button>
            </div>
          </div>
        </div>
      </div>

      {err && <p style={{ color: '#ef4444' }}>{err}</p>}
      {!data && !err && <p style={{ color: '#888' }}>Chargement…</p>}

      {data && (
        <>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
            <div style={box}><div style={num}>{data.stats.total}</div><div style={lbl}>scans</div></div>
            <div style={box}><div style={num}>{data.stats.geoloc}</div><div style={lbl}>géoloc précise</div></div>
            <div style={box}><div style={num}>{data.stats.byCity.length}</div><div style={lbl}>villes</div></div>
          </div>

          <div ref={mapRef} style={{ height: 380, borderRadius: 12, overflow: 'hidden', background: '#111', marginBottom: 16 }} />
          {!data.points.length && <p style={{ color: '#888', marginTop: -8, marginBottom: 16 }}>Aucun point géolocalisé pour l&apos;instant.</p>}

          <h2 style={{ fontSize: 15, margin: '8px 0' }}>Par ville</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {data.stats.byCity.map((c) => (
              <div key={c.city} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', background: '#141414', borderRadius: 8, fontSize: 13 }}>
                <span>{c.city}</span><span style={{ color: '#22d3ee', fontWeight: 600 }}>{c.n}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

const box: React.CSSProperties = { background: '#141414', border: '1px solid #222', borderRadius: 12, padding: '12px 18px', minWidth: 90, textAlign: 'center' };
const num: React.CSSProperties = { fontSize: 24, fontWeight: 700, color: '#22d3ee' };
const lbl: React.CSSProperties = { fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: '.5px' };
