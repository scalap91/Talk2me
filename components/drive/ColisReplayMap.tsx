'use client';

/**
 * Talk2Me — Carte de REJEU d'un colis (Pascal 2026-07-28 : « rejouer la séquence là où le colis
 * se perd / les délais sont anormalement longs »). Trace départ → trajet réel (positions des
 * shipment_events) → arrivée. La position ACTIVE (scrubber du sheet) est surlignée.
 * Leaflet + OSM (gratuit), même patron que ShipmentMap. Lecture seule (le référent ne décide rien).
 */
import { useEffect, useRef } from 'react';
import 'leaflet/dist/leaflet.css';

type Pt = { lat: number; lng: number; label?: string } | null | undefined;
export type ReplayPoint = { lat: number; lng: number; label?: string; stalled?: boolean };

export default function ColisReplayMap({
  origin, dest, points, activeIdx,
}: { origin: Pt; dest: Pt; points: ReplayPoint[]; activeIdx: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import('leaflet').Map | null>(null);
  const activeMarkerRef = useRef<import('leaflet').Marker | null>(null);
  const LRef = useRef<typeof import('leaflet') | null>(null);

  // Init carte + trajet (une fois par jeu de points)
  useEffect(() => {
    const el = ref.current; if (!el) return;
    let cancelled = false;
    (async () => {
      const L = (await import('leaflet')).default;
      if (cancelled || !el) return;
      LRef.current = L;
      const map = L.map(el, { zoomControl: true, attributionControl: false });
      mapRef.current = map;
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
      const pin = (emoji: string) => L.divIcon({ className: '', html: `<div style="font-size:22px;filter:drop-shadow(0 1px 2px #000)">${emoji}</div>`, iconSize: [24, 24], iconAnchor: [12, 12] });
      const all: [number, number][] = [];
      const mk = (p: Pt, emoji: string, label: string) => { if (!p || typeof p.lat !== 'number') return; L.marker([p.lat, p.lng], { icon: pin(emoji) }).addTo(map).bindPopup(label + (p.label ? ' — ' + p.label : '')); all.push([p.lat, p.lng]); };
      mk(origin, '🏪', 'Départ (vendeur)');
      // trajet réel : polyline des positions + petits repères numérotés (rouge si à l'arrêt)
      const line: [number, number][] = [];
      points.forEach((p, i) => {
        line.push([p.lat, p.lng]); all.push([p.lat, p.lng]);
        L.marker([p.lat, p.lng], {
          icon: L.divIcon({ className: '', html: `<div style="width:16px;height:16px;border-radius:50%;background:${p.stalled ? '#ef4444' : '#f59e0b'};border:2px solid #fff;font-size:9px;color:#000;text-align:center;line-height:14px;font-weight:700">${i + 1}</div>`, iconSize: [16, 16], iconAnchor: [8, 8] }),
        }).addTo(map).bindPopup(`Étape ${i + 1}${p.label ? ' — ' + p.label : ''}${p.stalled ? " · à l'arrêt" : ''}`);
      });
      mk(dest, '🏁', 'Livraison (client)');
      if (line.length >= 2) L.polyline(line, { color: '#f59e0b', weight: 3, opacity: 0.7 }).addTo(map);
      if (all.length) map.fitBounds(L.latLngBounds(all).pad(0.3)); else map.setView([-18.8792, 47.5079], 6);
      setTimeout(() => map.invalidateSize(), 200);
    })();
    return () => { cancelled = true; if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; } activeMarkerRef.current = null; };
  }, [origin, dest, points]);

  // Surligne la position active (halo qui se déplace au scrubber)
  useEffect(() => {
    const L = LRef.current, map = mapRef.current; if (!L || !map) return;
    const p = points[activeIdx];
    if (activeMarkerRef.current) { map.removeLayer(activeMarkerRef.current); activeMarkerRef.current = null; }
    if (!p) return;
    activeMarkerRef.current = L.marker([p.lat, p.lng], {
      icon: L.divIcon({ className: '', html: '<div style="width:28px;height:28px;border-radius:50%;background:rgba(255,127,17,0.35);border:2px solid #ff7f11;box-shadow:0 0 12px #ff7f11"></div>', iconSize: [28, 28], iconAnchor: [14, 14] }),
      zIndexOffset: -100,
    }).addTo(map);
    map.panTo([p.lat, p.lng]);
  }, [activeIdx, points]);

  return <div ref={ref} className="w-full h-64 rounded-2xl overflow-hidden border border-white/10 bg-black/30" />;
}
