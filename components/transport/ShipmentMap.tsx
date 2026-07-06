'use client';

/**
 * Talk2Me — Carte d'un colis (Brique B/C). Montre : départ (vendeur), arrivée (client),
 * et la position VIVANTE du colis (= détenteur). Pour le maillon suivant, la position du
 * colis EST le point de rendez-vous. Leaflet + OSM (gratuit). Pascal 2026-06-22.
 */
import { useEffect, useRef } from 'react';
import 'leaflet/dist/leaflet.css';

type Pt = { lat: number; lng: number; label?: string } | null | undefined;

export default function ShipmentMap({ origin, dest, colis, rendezvous }: { origin: Pt; dest: Pt; colis: Pt; rendezvous?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current; if (!el) return;
    let map: import('leaflet').Map | null = null;
    let cancelled = false;

    (async () => {
      const L = (await import('leaflet')).default;
      if (cancelled || !el) return;
      map = L.map(el, { zoomControl: true, attributionControl: false });
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);

      const pin = (emoji: string, color: string) => L.divIcon({
        className: '', html: `<div style="font-size:22px;filter:drop-shadow(0 1px 2px #000)">${emoji}</div>`,
        iconSize: [24, 24], iconAnchor: [12, 12],
      });
      const pts: [number, number][] = [];
      const mk = (p: Pt, emoji: string, color: string, label: string) => {
        if (!p || typeof p.lat !== 'number') return;
        L.marker([p.lat, p.lng], { icon: pin(emoji, color) }).addTo(map!).bindPopup(label + (p.label ? ' — ' + p.label : ''));
        pts.push([p.lat, p.lng]);
      };
      mk(origin, '🏪', '#888', 'Départ (vendeur)');
      mk(colis, rendezvous ? '📍' : '📦', '#f59e0b', rendezvous ? 'Point de rendez-vous (colis ici)' : 'Colis (position actuelle)');
      mk(dest, '🏁', '#10b981', 'Livraison (client)');

      // trait départ → colis → arrivée
      const line: [number, number][] = [];
      if (origin) line.push([origin.lat, origin.lng]);
      if (colis) line.push([colis.lat, colis.lng]);
      if (dest) line.push([dest.lat, dest.lng]);
      if (line.length >= 2) L.polyline(line, { color: '#f59e0b', weight: 3, opacity: 0.6, dashArray: '6 6' }).addTo(map);

      if (pts.length) map.fitBounds(L.latLngBounds(pts).pad(0.3));
      else map.setView([-18.8792, 47.5079], 6); // Madagascar par défaut
      setTimeout(() => map?.invalidateSize(), 200);
    })();

    return () => { cancelled = true; if (map) map.remove(); };
  }, [origin, dest, colis, rendezvous]);

  return <div ref={ref} className="w-full h-56 rounded-2xl overflow-hidden border border-white/10 bg-black/30" />;
}
