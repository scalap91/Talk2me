'use client';

import { useEffect, useRef, useCallback } from 'react';
import 'leaflet/dist/leaflet.css';

// Leaflet est chargé au RUNTIME côté client via `await import('leaflet')` (voir initMap),
// ce qui expose l'objet global `window.L` (bundle UMD). On NE fait PAS d'import statique :
// Leaflet touche `window` au chargement et casserait le rendu serveur (SSR) de ce composant.
// Cette déclaration ambiante type-only donne le typage de `L` sans émettre d'import runtime.
declare const L: typeof import('leaflet');

// Types pour les marqueurs
interface MarkerData {
  id: string;
  lat: number;
  lng: number;
  kind: 'me' | 'driver' | 'rider' | 'pickup';
  label?: string;
}

interface DriveMapProps {
  center: { lat: number; lng: number } | null;
  markers: MarkerData[];
  route?: [number, number][]; // itinéraire réel (suit les routes, via OSRM)
  className?: string;
  /** Toujours centrer sur `center` (zoom fixe) au lieu de cadrer tous les points. */
  followCenter?: boolean;
  zoom?: number;
  /** Clic sur un marqueur → renvoie son id (pour ouvrir un détail). */
  onMarkerClick?: (id: string) => void;
  /** Clic sur la carte (lieux sans adresse, ex Madagascar) → renvoie lat/lng. */
  onMapClick?: (lat: number, lng: number) => void;
}

/**
 * Composant carte Leaflet avec OpenStreetMap
 * Utilise le chargement dynamique pour éviter les erreurs SSR
 */
export default function DriveMap({ center, markers, route, className = '', followCenter = false, zoom = 16, onMarkerClick, onMapClick }: DriveMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);
  const onMapClickRef = useRef(onMapClick);
  onMapClickRef.current = onMapClick;

  // Création des icônes personnalisées
  const createIcon = useCallback((kind: MarkerData['kind'], label?: string) => {
    const icons: Record<MarkerData['kind'], { html: string; className: string }> = {
      me: {
        html: `<div style="
          width: 20px; height: 20px; 
          background: #3b82f6; 
          border-radius: 50%; 
          border: 3px solid white;
          box-shadow: 0 0 0 4px rgba(59,130,246,0.3);
          animation: pulse-blue 2s infinite;
        "></div>`,
        className: 'custom-marker-me'
      },
      driver: {
        html: `<div style="
          width: 36px; height: 36px;
          background: #ef4444;
          border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          font-size: 18px;
          border: 2px solid white;
          box-shadow: 0 2px 6px rgba(0,0,0,0.3);
        ">🚗</div>`,
        className: 'custom-marker-driver'
      },
      rider: {
        html: `<div style="
          width: 16px; height: 16px;
          background: white;
          border-radius: 50%;
          border: 2px solid #6b7280;
          box-shadow: 0 1px 3px rgba(0,0,0,0.2);
        "></div>`,
        className: 'custom-marker-rider'
      },
      pickup: {
        html: `<div style="
          width: 14px; height: 14px;
          background: #f59e0b;
          border-radius: 50%;
          border: 2px solid white;
          box-shadow: 0 0 0 2px rgba(245,158,11,0.4);
        "></div>`,
        className: 'custom-marker-pickup'
      }
    };

    const config = icons[kind];
    return L.divIcon({
      html: label 
        ? `<div style="position:relative">${config.html}<span style="
            position:absolute; top:-20px; left:50%; transform:translateX(-50%);
            background:rgba(0,0,0,0.7); color:white; padding:2px 6px;
            border-radius:4px; font-size:11px; white-space:nowrap;
          ">${label}</span></div>`
        : config.html,
      className: config.className,
      iconSize: [36, 36],
      iconAnchor: [18, 18]
    });
  }, []);

  // Initialisation de la carte (une seule fois)
  useEffect(() => {
    if (typeof window === 'undefined' || !mapRef.current) return;

    let isMounted = true;

    const initMap = async () => {
      const L = (await import('leaflet')).default;

      if (!isMounted || !mapRef.current) return;

      // Vue par défaut si aucun centre
      const defaultCenter: [number, number] = center 
        ? [center.lat, center.lng] 
        : [20, 0];
      const defaultZoom = center ? 15 : 2;

      // Création de la carte — rendu épuré type Uber (pas de boutons +/-).
      const map = L.map(mapRef.current, {
        center: defaultCenter,
        zoom: defaultZoom,
        zoomControl: false,
        attributionControl: false
      });

      // Tuile DARK premium (CARTO dark_all, sans clé) — colle au thème noir.
      L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        subdomains: 'abcd',
        attribution: '',
        maxZoom: 20
      }).addTo(map);
      // (attribution OSM/CARTO retirée à la demande de Pascal)

      // Layer group pour les marqueurs
      const layerGroup = L.layerGroup().addTo(map);
      layerGroupRef.current = layerGroup;
      mapInstanceRef.current = map;

      // Clic sur la carte → pose le centre de recherche (lieux sans adresse,
      // ex Madagascar : on tape l'endroit au lieu de saisir une adresse).
      map.on('click', (e: L.LeafletMouseEvent) => {
        if (onMapClickRef.current) onMapClickRef.current(e.latlng.lat, e.latlng.lng);
      });

      // Invalidate size après montage
      setTimeout(() => {
        if (mapInstanceRef.current) {
          mapInstanceRef.current.invalidateSize();
        }
      }, 100);
    };

    initMap();

    return () => {
      isMounted = false;
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        layerGroupRef.current = null;
      }
    };
  }, []); // Dépendance vide → une seule initialisation

  // Mise à jour des marqueurs et du cadrage
  useEffect(() => {
    if (!mapInstanceRef.current || !layerGroupRef.current) return;

    const map = mapInstanceRef.current;
    const layerGroup = layerGroupRef.current;

    // Nettoyage des anciens marqueurs
    layerGroup.clearLayers();

    if (markers.length === 0) return;

    // Itinéraire réel (suit les routes) — tracé sous les marqueurs.
    if (route && route.length >= 2) {
      layerGroup.addLayer(L.polyline(route, { color: '#dc2626', weight: 5, opacity: 0.85, lineJoin: 'round' }));
    }

    // Ajout des nouveaux marqueurs
    markers.forEach(marker => {
      const icon = createIcon(marker.kind, marker.label);
      const leafletMarker = L.marker([marker.lat, marker.lng], { icon });
      if (onMarkerClick) leafletMarker.on('click', () => onMarkerClick(marker.id));
      layerGroup.addLayer(leafletMarker);
    });

    // followCenter : on reste TOUJOURS centré sur `center` (zoom fixe) → la carte
    // se recentre dès que la localisation arrive/change. Sinon : cadrage auto.
    if (followCenter && center) {
      map.setView([center.lat, center.lng], zoom);
    } else {
      const allPts: [number, number][] = [...markers.map(m => [m.lat, m.lng] as [number, number]), ...(route || [])];
      if (allPts.length >= 2) {
        map.fitBounds(L.latLngBounds(allPts), { padding: [40, 40] });
      } else if (center) {
        map.setView([center.lat, center.lng], 15);
      } else {
        map.setView([markers[0].lat, markers[0].lng], 15);
      }
    }

  }, [markers, center, route, createIcon, followCenter, zoom, onMarkerClick]);

  return (
    <div 
      ref={mapRef} 
      className={`h-full w-full ${className}`}
      style={{ minHeight: '300px' }}
    />
  );
}
