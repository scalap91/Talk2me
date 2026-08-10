'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, useCallback, useRef } from 'react';
import {
  ChevronLeft,
  Phone,
  MessageSquare,
  Star,
  StarOff,
  X,
  MapPin,
  Navigation,
  User,
  Car,
  Clock,
  AlertCircle,
  RefreshCw,
  WifiOff,
  Loader2,
} from '@/lib/icons';
import DriveMap from '@/components/drive/DriveMap';
import RentalSheet from '@/components/drive/RentalSheet';
import MyRentalsSheet from '@/components/drive/MyRentalsSheet';
import ReferentColisSheet from '@/components/drive/ReferentColisSheet';
import FleetSheet from '@/components/drive/FleetSheet';
import { VEHICLE_MAP } from '@/lib/drive-vehicles';

// Types conformes aux contrats API
interface Peer {
  id: string;
  talk2me_id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
}

interface RideView {
  id: string;
  status: 'demandee' | 'acceptee' | 'en_route' | 'a_bord' | 'terminee' | 'annulee';
  pickup_lat: number;
  pickup_lng: number;
  pickup_label: string | null;
  created_at: number;
  rider: Peer | null;
  driver: Peer | null;
}

interface Vehicle {
  key: string;
  label: string;
  emoji: string;
  parcel: boolean;
}

interface NearbyDriver {
  peer: Peer;
  vehicle_type: string;
  distance_km: number;
  favorite: boolean;
}

interface DriverProfile {
  vehicle_type: string;
  is_online: boolean;
  last_lat: number | null;
  last_lng: number | null;
}

interface DriverData {
  profile: DriverProfile | null;
  requests: RideView[];
  active: RideView | null;
}

interface RiderData {
  active: RideView | null;
  favorites: { peer: Peer; online: boolean }[];
}

interface RideWithPosition {
  ride: RideView;
  driver_pos: { lat: number; lng: number } | null;
}

// Labels statut en français
const STATUS_LABELS: Record<string, string> = {
  demandee: 'Recherche d\'un chauffeur…',
  acceptee: 'Chauffeur en route',
  en_route: 'En route',
  a_bord: 'À bord',
  terminee: 'Terminée',
  annulee: 'Annulée',
};

// Mode utilisateur
type UserMode = 'passenger' | 'driver';

// Estimation course : distance haversine + tarif (base + au km) + ETA.
// Tarif indicatif (cash à bord) : base 1,50 € + 0,80 €/km, arrondi à 0,50 €.
const FARE_BASE_CENTS = 150;
const FARE_PER_KM_CENTS = 80;
function estimateFare(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  const distanceM = Math.round(R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s)));
  const km = distanceM / 1000;
  const raw = FARE_BASE_CENTS + FARE_PER_KM_CENTS * km;
  const fareCents = Math.max(FARE_BASE_CENTS, Math.round(raw / 50) * 50); // arrondi 0,50 €
  const etaMin = Math.max(2, Math.round(km / 0.4)); // ~24 km/h
  return { distanceM, km, fareCents, etaMin };
}
const eur = (c: number) => (c / 100).toLocaleString('fr-FR', { minimumFractionDigits: c % 100 ? 2 : 0 }) + ' €';

// Tarif : distance ROUTIÈRE (OSRM) si dispo, sinon vol d'oiseau. Forfait prioritaire.
function computeFare(a: { lat: number; lng: number }, b: { lat: number; lng: number; forfait?: number }, route: { m: number; s: number } | null) {
  const base = estimateFare(a, b);
  const m = route?.m ?? base.distanceM;
  const km = m / 1000;
  const etaMin = route ? Math.max(2, Math.round(route.s / 60)) : base.etaMin;
  const fareCents = b.forfait != null ? b.forfait : Math.max(FARE_BASE_CENTS, Math.round((FARE_BASE_CENTS + FARE_PER_KM_CENTS * km) / 50) * 50);
  return { distanceM: m, km, fareCents, etaMin };
}

// Grandes destinations à FORFAIT (depuis le secteur Évry/Essonne — service local).
// Prix fixe quel que soit le détail du trajet (un VTC est sectoriel).
const PRESETS: { label: string; lat: number; lng: number; forfait: number }[] = [
  { label: '✈️ Aéroport Paris-CDG', lat: 49.0097, lng: 2.5479, forfait: 5000 },
  { label: '✈️ Aéroport Orly', lat: 48.7262, lng: 2.3652, forfait: 3500 },
  { label: '✈️ Aéroport Beauvais', lat: 49.4544, lng: 2.1128, forfait: 9000 },
  { label: '🚄 Gare de Lyon (Paris)', lat: 48.8443, lng: 2.3743, forfait: 4500 },
  { label: '🏙️ Paris centre', lat: 48.8607, lng: 2.3470, forfait: 4500 },
  { label: '🎢 Disneyland Paris', lat: 48.8722, lng: 2.7758, forfait: 5500 },
];

export default function DrivePage() {
  const router = useRouter();

  // État général
  const [mode, setMode] = useState<UserMode>('passenger');
  const [showRentals, setShowRentals] = useState(false); // sheet « Louer un véhicule »
  const [showFleet, setShowFleet] = useState(false); // sheet « Ma flotte » (déclarer ses véhicules → fleet)
  const [fleet, setFleet] = useState<{ type: string; plate?: string }[]>([]); // MA flotte réelle → pilote le picker « quel véhicule je conduis » (4b-1)
  const [showMyRentals, setShowMyRentals] = useState(false); // sheet « Mes locations » (proprio)
  const [hasMyRentals, setHasMyRentals] = useState(false); // l'user a ≥1 véhicule en location
  // Affiche « Mes locations » seulement si l'user possède au moins un véhicule en location.
  useEffect(() => {
    fetch('/api/drive/my-rentals', { cache: 'no-store' })
      .then((r) => r.json()).then((d) => setHasMyRentals(!!d?.vehicles?.length)).catch(() => {});
  }, []);
  const [showReferentColis, setShowReferentColis] = useState(false); // sheet « Colis de ma zone » (référent)
  const [hasReferentColis, setHasReferentColis] = useState(false); // l'user parraine ≥1 chauffeur qui porte un colis actif
  // Affiche « Colis de ma zone » seulement si des colis de MA downline sont en cours.
  useEffect(() => {
    fetch('/api/transport/referent-shipments', { cache: 'no-store' })
      .then((r) => r.json()).then((d) => setHasReferentColis(!!d?.shipments?.length)).catch(() => {});
  }, []);
  const [position, setPosition] = useState<{ lat: number; lng: number } | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [regionVehicles, setRegionVehicles] = useState<Vehicle[]>([]);

  // Mode d'affichage des « Grandes destinations » : cards (liste) | photo (tuiles). Piloté par <html data-d-drive>.
  const [destDisplay, setDestDisplay] = useState<'cards' | 'photo'>('cards');
  useEffect(() => {
    const read = () => setDestDisplay(document.documentElement.dataset.dDrive === 'photo' ? 'photo' : 'cards');
    read();
    window.addEventListener('t2m:theme', read);
    return () => window.removeEventListener('t2m:theme', read);
  }, []);

  // État passager
  const [nearbyDrivers, setNearbyDrivers] = useState<NearbyDriver[]>([]);
  const [riderData, setRiderData] = useState<RiderData | null>(null);
  const [activeRide, setActiveRide] = useState<RideView | null>(null);
  const [driverPos, setDriverPos] = useState<{ lat: number; lng: number } | null>(null);
  // Commander une course : destination + estimation prix
  const [destQuery, setDestQuery] = useState('');
  const [destResults, setDestResults] = useState<{ label: string; lat: number; lng: number }[]>([]);
  const [dest, setDest] = useState<{ label: string; lat: number; lng: number; forfait?: number } | null>(null);
  const [geocoding, setGeocoding] = useState(false);
  const [routeLine, setRouteLine] = useState<[number, number][]>([]);
  const [routeInfo, setRouteInfo] = useState<{ m: number; s: number } | null>(null);

  // État chauffeur
  const [driverData, setDriverData] = useState<DriverData | null>(null);
  const [driverOnline, setDriverOnline] = useState(false);
  const [driverVehicleType, setDriverVehicleType] = useState<string>('');

  // Références pour les intervalles
  const riderPollRef = useRef<NodeJS.Timeout | null>(null);
  const driverPollRef = useRef<NodeJS.Timeout | null>(null);
  const positionHeartbeatRef = useRef<NodeJS.Timeout | null>(null);

  // Récupération de la position GPS
  const getPosition = useCallback(() => {
    if (typeof window === 'undefined' || !navigator.geolocation) {
      setGeoError('Géolocalisation non disponible');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setGeoError(null);
      },
      (err) => {
        setGeoError('Position non disponible');
        console.warn('Erreur géolocalisation:', err.message);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, []);

  // Chargement initial
  useEffect(() => {
    getPosition();
  }, [getPosition]);

  // Récupération des véhicules régionaux
  useEffect(() => {
    if (!position) return;
    fetch(`/api/drive/region?lat=${position.lat}&lng=${position.lng}`, { cache: 'no-store' })
      .then((r) => {
        if (r.status === 401) router.push('/signin');
        return r.json();
      })
      .then((data: { country: string | null; vehicles: Vehicle[] }) => {
        setRegionVehicles(data.vehicles); // catalogue régional (sert l'affichage côté passager)
      })
      .catch(console.error);
  }, [position, router]);

  // MA flotte (véhicules déclarés) → pilote le picker « quel véhicule je conduis cette session » (Pascal 4b-1).
  useEffect(() => {
    fetch('/api/transport/profile', { cache: 'no-store' }).then((r) => r.json()).then((d) => {
      const f = Array.isArray(d?.profile?.fleet) ? (d.profile.fleet as { type: string; plate?: string }[]) : [];
      setFleet(f);
      if (f.length > 0) setDriverVehicleType((cur) => cur || f[0].type);
    }).catch(() => {});
  }, []);

  // Polling passager
  const pollRider = useCallback(async () => {
    if (mode !== 'passenger') return;
    try {
      const res = await fetch('/api/drive/rider', { cache: 'no-store' });
      if (res.status === 401) return router.push('/signin');
      const data: RiderData = await res.json();
      setRiderData(data);
      setActiveRide(data.active);

      if (data.active) {
        // Si course active, on récupère la position du chauffeur
        const rideRes = await fetch(`/api/drive/ride?id=${data.active.id}`, { cache: 'no-store' });
        if (rideRes.ok) {
          const rideData: RideWithPosition = await rideRes.json();
          setDriverPos(rideData.driver_pos);
        }
      } else {
        // Sinon on récupère les chauffeurs proches
        if (position) {
          const nearbyRes = await fetch(`/api/drive/nearby?lat=${position.lat}&lng=${position.lng}`, { cache: 'no-store' });
          if (nearbyRes.ok) {
            const nearbyData: { drivers?: NearbyDriver[] } = await nearbyRes.json();
            setNearbyDrivers(Array.isArray(nearbyData.drivers) ? nearbyData.drivers : []);
          }
        }
      }
    } catch (err) {
      console.error('Erreur polling passager:', err);
    }
  }, [mode, position, router]);

  // Polling chauffeur
  const pollDriver = useCallback(async () => {
    if (mode !== 'driver') return;
    try {
      const res = await fetch('/api/drive/driver', { cache: 'no-store' });
      if (res.status === 401) return router.push('/signin');
      const data: DriverData = await res.json();
      setDriverData(data);
      if (data.profile) {
        setDriverOnline(data.profile.is_online);
        if (data.profile.vehicle_type) setDriverVehicleType(data.profile.vehicle_type);
      }
    } catch (err) {
      console.error('Erreur polling chauffeur:', err);
    }
  }, [mode, router]);

  // Heartbeat position chauffeur
  const heartbeatPosition = useCallback(async () => {
    if (!position || !driverOnline || mode !== 'driver') return;
    try {
      await fetch('/api/drive/driver', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'set',
          online: true,
          lat: position.lat,
          lng: position.lng,
          vehicle_type: driverVehicleType,
        }),
      });
    } catch (err) {
      console.error('Erreur heartbeat:', err);
    }
  }, [position, driverOnline, mode, driverVehicleType]);

  // Gestion des intervalles
  useEffect(() => {
    // Nettoyage des anciens intervalles
    if (riderPollRef.current) clearInterval(riderPollRef.current);
    if (driverPollRef.current) clearInterval(driverPollRef.current);
    if (positionHeartbeatRef.current) clearInterval(positionHeartbeatRef.current);

    if (mode === 'passenger') {
      pollRider();
      riderPollRef.current = setInterval(pollRider, 4000);
    } else {
      pollDriver();
      driverPollRef.current = setInterval(pollDriver, 6000);
      if (driverOnline) {
        heartbeatPosition();
        positionHeartbeatRef.current = setInterval(heartbeatPosition, 30000);
      }
    }

    return () => {
      if (riderPollRef.current) clearInterval(riderPollRef.current);
      if (driverPollRef.current) clearInterval(driverPollRef.current);
      if (positionHeartbeatRef.current) clearInterval(positionHeartbeatRef.current);
    };
  }, [mode, driverOnline, pollRider, pollDriver, heartbeatPosition]);

  // Commande d'une course (passager)
  const handleRequestRide = useCallback(
    async (driverId?: string) => {
      if (!position) return;
      const est = dest ? computeFare(position, dest, routeInfo) : null;
      try {
        const res = await fetch('/api/drive/request', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            lat: position.lat, lng: position.lng, driver_id: driverId,
            dest_lat: dest?.lat, dest_lng: dest?.lng, dest_label: dest?.label,
            fare_cents: est?.fareCents, distance_m: est?.distanceM,
          }),
        });
        if (res.status === 401) return router.push('/signin');
        const data: { ride: RideView } = await res.json();
        setActiveRide(data.ride);
      } catch (err) {
        console.error('Erreur commande:', err);
      }
    },
    [position, dest, routeInfo, router]
  );

  // Géocodage de la destination (Nominatim, sans clé) — débounce.
  useEffect(() => {
    const q = destQuery.trim();
    if (q.length < 3 || dest) { setDestResults([]); return; }
    setGeocoding(true);
    const id = setTimeout(async () => {
      try {
        // Sectoriel : France uniquement (countrycodes=fr) + biais autour de la position.
        const near = position ? `&viewbox=${position.lng - 0.8},${position.lat + 0.8},${position.lng + 0.8},${position.lat - 0.8}` : '';
        const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&countrycodes=fr&limit=6&q=${encodeURIComponent(q)}${near}`, { headers: { 'Accept-Language': 'fr' } }).then((x) => x.json());
        setDestResults((Array.isArray(r) ? r : []).map((p: { display_name: string; lat: string; lon: string }) => ({ label: p.display_name, lat: parseFloat(p.lat), lng: parseFloat(p.lon) })));
      } catch { /* silencieux */ } finally { setGeocoding(false); }
    }, 500);
    return () => clearTimeout(id);
  }, [destQuery, dest, position]);

  // Itinéraire réel via OSRM (gratuit) — trace les routes + distance/temps réels.
  useEffect(() => {
    if (!position || !dest) { setRouteLine([]); setRouteInfo(null); return; }
    let cancel = false;
    fetch(`https://router.project-osrm.org/route/v1/driving/${position.lng},${position.lat};${dest.lng},${dest.lat}?overview=full&geometries=geojson`)
      .then((r) => r.json())
      .then((d) => {
        if (cancel) return;
        const rt = d.routes?.[0];
        if (rt?.geometry?.coordinates) {
          setRouteLine(rt.geometry.coordinates.map((c: [number, number]) => [c[1], c[0]] as [number, number]));
          setRouteInfo({ m: rt.distance, s: rt.duration });
        }
      })
      .catch(() => {});
    return () => { cancel = true; };
  }, [position, dest]);

  const estimate = position && dest ? computeFare(position, dest, routeInfo) : null;

  // Annulation d'une course (passager)
  const handleCancelRide = useCallback(async () => {
    if (!activeRide) return;
    try {
      await fetch('/api/drive/rider', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel', ride_id: activeRide.id }),
      });
      setActiveRide(null);
      setDriverPos(null);
    } catch (err) {
      console.error('Erreur annulation:', err);
    }
  }, [activeRide]);

  // Favori / unfavori (passager)
  const handleToggleFavorite = useCallback(async (driverId: string, isFavorite: boolean) => {
    try {
      await fetch('/api/drive/rider', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: isFavorite ? 'unfavorite' : 'favorite', driver_id: driverId }),
      });
      // Rafraîchir les données
      pollRider();
    } catch (err) {
      console.error('Erreur favori:', err);
    }
  }, [pollRider]);

  // Appel téléphonique
  const handleCall = useCallback(async (peer: Peer) => {
    try {
      const res = await fetch('/api/calls/new', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callee_id: peer.id, kind: 'audio', layer: 'comm' }),
      });
      if (res.ok) {
        const j = await res.json();
        if (j.call_id) {
          window.dispatchEvent(new CustomEvent('ttm:call:start', { detail: { call_id: j.call_id, kind: 'audio', callee: j.callee } }));
        }
      }
    } catch (err) {
      console.error('Erreur appel:', err);
    }
  }, []);

  // SMS
  const handleSms = useCallback((peer: Peer) => {
    router.push(`/sms?to=${encodeURIComponent(peer.talk2me_id || peer.username)}`);
  }, [router]);

  // Activation chauffeur
  const handleToggleOnline = useCallback(async () => {
    if (!position) return;
    const newOnline = !driverOnline;
    try {
      const res = await fetch('/api/drive/driver', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'set',
          online: newOnline,
          lat: position.lat,
          lng: position.lng,
          vehicle_type: driverVehicleType,
        }),
      });
      if (res.status === 401) return router.push('/signin');
      setDriverOnline(newOnline);
    } catch (err) {
      console.error('Erreur toggle online:', err);
    }
  }, [position, driverOnline, driverVehicleType, router]);

  // Acceptation d'une demande (chauffeur)
  const handleAcceptRequest = useCallback(async (rideId: string) => {
    try {
      await fetch('/api/drive/driver', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'accept', ride_id: rideId }),
      });
      pollDriver();
    } catch (err) {
      console.error('Erreur acceptation:', err);
    }
  }, [pollDriver]);

  // Changement de statut (chauffeur)
  const handleDriverStatus = useCallback(async (rideId: string, to: string) => {
    try {
      await fetch('/api/drive/driver', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'status', ride_id: rideId, to }),
      });
      pollDriver();
    } catch (err) {
      console.error('Erreur changement statut:', err);
    }
  }, [pollDriver]);

  // Construction des markers pour la carte
  const buildMarkers = useCallback(() => {
    const markers: { id: string; lat: number; lng: number; kind: 'me' | 'driver' | 'rider' | 'pickup'; label?: string }[] = [];

    // Position de l'utilisateur
    if (position) {
      markers.push({ id: 'me', lat: position.lat, lng: position.lng, kind: 'me', label: 'Moi' });
    }

    if (mode === 'passenger') {
      if (activeRide) {
        // Point de prise en charge
        markers.push({
          id: 'pickup',
          lat: activeRide.pickup_lat,
          lng: activeRide.pickup_lng,
          kind: 'pickup',
          label: activeRide.pickup_label || 'Point de prise',
        });
        // Position du chauffeur si disponible
        if (driverPos) {
          markers.push({ id: 'driver', lat: driverPos.lat, lng: driverPos.lng, kind: 'driver', label: 'Chauffeur' });
        }
      } else {
        // Destination choisie (avant commande) → marqueur d'arrivée.
        if (dest) {
          markers.push({ id: 'dest', lat: dest.lat, lng: dest.lng, kind: 'pickup', label: 'Destination' });
        }
        // Chauffeurs proches
        nearbyDrivers.forEach((d) => {
          // On n'a pas la position exacte des chauffeurs, on utilise la position de l'utilisateur comme fallback
          // Dans une vraie app, l'API nearby devrait retourner les positions
          // Ici on simule des positions aléatoires autour de l'utilisateur pour la démo
          if (position) {
            const offsetLat = (Math.random() - 0.5) * 0.02;
            const offsetLng = (Math.random() - 0.5) * 0.02;
            markers.push({
              id: `driver-${d.peer.id}`,
              lat: position.lat + offsetLat,
              lng: position.lng + offsetLng,
              kind: 'driver',
              label: d.peer.display_name || d.peer.username,
            });
          }
        });
      }
    } else {
      // Mode chauffeur
      if (driverData?.active) {
        // Course active : point de prise du passager
        markers.push({
          id: 'rider',
          lat: driverData.active.pickup_lat,
          lng: driverData.active.pickup_lng,
          kind: 'rider',
          label: driverData.active.pickup_label || 'Passager',
        });
      } else if (driverData?.requests) {
        // Demandes en attente
        driverData.requests.forEach((req) => {
          markers.push({
            id: `request-${req.id}`,
            lat: req.pickup_lat,
            lng: req.pickup_lng,
            kind: 'rider',
            label: req.pickup_label || 'Demande',
          });
        });
      }
    }

    return markers;
  }, [position, mode, activeRide, driverPos, nearbyDrivers, driverData]);

  // Rendu du statut de course (passager)
  const renderRideStatus = () => {
    if (!activeRide) return null;

    const statusText = STATUS_LABELS[activeRide.status] || activeRide.status;
    const driver = activeRide.driver;

    return (
      <div className="space-y-4">
        {/* Statut */}
        <div className="flex items-center gap-3 bg-black/[0.04] rounded-2xl p-4">
          <div className={`w-3 h-3 rounded-full ${activeRide.status === 'demandee' ? 'bg-yellow-400 animate-pulse' : activeRide.status === 'acceptee' || activeRide.status === 'en_route' ? 'bg-red-400 animate-pulse' : activeRide.status === 'a_bord' ? 'bg-green-400' : 'bg-gray-400'}`} />
          <span className="text-[#2F343A] font-medium">{statusText}</span>
        </div>

        {/* Infos chauffeur */}
        {driver && (
          <div className="bg-black/[0.04] rounded-2xl p-4 space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-[#FF7F11]/20 flex items-center justify-center">
                <User className="w-6 h-6 text-red-400" />
              </div>
              <div>
                <p className="text-[#2F343A] font-medium">{driver.display_name || driver.username}</p>
                <p className="text-gray-400 text-sm">Chauffeur</p>
              </div>
            </div>

            {/* Boutons d'action */}
            <div className="flex gap-2">
              <button
                onClick={() => handleCall(driver)}
                className="flex-1 flex items-center justify-center gap-2 bg-[#FF7F11]/20 hover:bg-[#FF7F11]/30 text-red-300 rounded-xl py-2 transition-colors active:scale-95"
              >
                <Phone className="w-4 h-4" />
                <span className="text-sm">Appeler</span>
              </button>
              <button
                onClick={() => handleSms(driver)}
                className="flex-1 flex items-center justify-center gap-2 bg-black/[0.04] hover:bg-white/20 text-[#2F343A] rounded-xl py-2 transition-colors active:scale-95"
              >
                <MessageSquare className="w-4 h-4" />
                <span className="text-sm">SMS</span>
              </button>
            </div>
          </div>
        )}

        {/* Bouton annuler */}
        {activeRide.status !== 'terminee' && activeRide.status !== 'annulee' && (
          <button
            onClick={handleCancelRide}
            className="w-full flex items-center justify-center gap-2 bg-[#FF7F11]/20 hover:bg-[#FF7F11]/30 text-red-300 rounded-xl py-3 transition-colors active:scale-95"
          >
            <X className="w-4 h-4" />
            <span>Annuler la course</span>
          </button>
        )}

        {/* Mention cash */}
        <p className="text-center text-gray-500 text-xs">Paiement : cash à bord</p>
      </div>
    );
  };

  // Rendu de la liste des chauffeurs proches (passager)
  const renderNearbyDrivers = () => {
    if (activeRide) return null;

    // Trier : favoris en premier
    const sorted = [...nearbyDrivers].sort((a, b) => (b.favorite ? 1 : 0) - (a.favorite ? 1 : 0));

    return (
      <div className="space-y-3">
        {/* Louer un véhicule (avec/sans chauffeur) — source = petites annonces */}
        <button
          onClick={() => setShowRentals(true)}
          className="w-full flex items-center gap-3 bg-white/[0.06] border border-[#E7EAF0] rounded-2xl px-4 py-3 active:scale-[0.99]"
        >
          <span className="w-9 h-9 rounded-full bg-[#FF7F11]/15 border border-red-400/30 grid place-items-center text-red-300"><Car className="w-5 h-5" /></span>
          <span className="flex-1 text-left">
            <span className="block text-[#2F343A] text-[14px] font-semibold">Louer un véhicule</span>
            <span className="block text-[#9DAAB7] text-[12px]">Avec ou sans chauffeur · à la journée</span>
          </span>
          <ChevronLeft className="w-5 h-5 text-[#9DAAB7] rotate-180" />
        </button>

        {/* Mes locations (propriétaire) : gérer le planning de mes véhicules */}
        {hasMyRentals && (
          <button
            onClick={() => setShowMyRentals(true)}
            className="w-full flex items-center gap-3 bg-white/[0.06] border border-[#E7EAF0] rounded-2xl px-4 py-3 active:scale-[0.99]"
          >
            <span className="w-9 h-9 rounded-full bg-emerald-500/15 border border-emerald-400/30 grid place-items-center text-emerald-300"><Clock className="w-5 h-5" /></span>
            <span className="flex-1 text-left">
              <span className="block text-[#2F343A] text-[14px] font-semibold">Mes locations</span>
              <span className="block text-[#9DAAB7] text-[12px]">Gérer le planning (jours dispo / bloqués)</span>
            </span>
            <ChevronLeft className="w-5 h-5 text-[#9DAAB7] rotate-180" />
          </button>
        )}

        {/* Colis de ma zone (référent) : suivre les colis de mes chauffeurs + rejouer + appeler in-app */}
        {hasReferentColis && (
          <button
            onClick={() => setShowReferentColis(true)}
            className="w-full flex items-center gap-3 bg-white/[0.06] border border-[#E7EAF0] rounded-2xl px-4 py-3 active:scale-[0.99]"
          >
            <span className="w-9 h-9 rounded-full bg-[#ff7f11]/15 border border-[#ff7f11]/30 grid place-items-center text-[18px]">📦</span>
            <span className="flex-1 text-left">
              <span className="block text-[#2F343A] text-[14px] font-semibold">Colis de ma zone</span>
              <span className="block text-[#9DAAB7] text-[12px]">Suivre, rejouer le trajet, appeler les 2 parties</span>
            </span>
            <ChevronLeft className="w-5 h-5 text-[#9DAAB7] rotate-180" />
          </button>
        )}

        {/* OÙ VAS-TU ? — destination + estimation prix */}
        {!dest ? (
          <div>
            <div className="flex items-center gap-2 bg-black/[0.04] rounded-2xl px-4 py-3">
              <MapPin className="w-5 h-5 text-red-300 shrink-0" />
              <input
                value={destQuery}
                onChange={(e) => setDestQuery(e.target.value)}
                placeholder="Où vas-tu ?"
                className="flex-1 bg-transparent text-[#2F343A] placeholder-gray-500 outline-none text-[15px]"
              />
              {geocoding && <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />}
            </div>
            {destResults.length > 0 && (
              <div className="mt-2 space-y-1">
                {destResults.map((r, i) => (
                  <button
                    key={i}
                    onClick={() => { setDest(r); setDestQuery(''); setDestResults([]); }}
                    className="w-full flex items-start gap-2 text-left bg-black/[0.04] hover:bg-black/[0.04] rounded-xl px-3 py-2.5 active:scale-[0.99]"
                  >
                    <MapPin className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
                    <span className="text-[13px] text-[#6A7585] line-clamp-2">{r.label}</span>
                  </button>
                ))}
              </div>
            )}
            {/* Grandes destinations à forfait (raccourcis) */}
            {destResults.length === 0 && !destQuery && (
              <div className="mt-3">
                <p className="text-gray-400 text-[12px] mb-1.5 px-1">Grandes destinations (forfait)</p>
                {destDisplay === 'photo' ? (
                  <div className="grid grid-cols-2 gap-2">
                    {PRESETS.map((p) => {
                      // label = « emoji + nom » ; on isole l'emoji pour le fallback centré.
                      const sp = p.label.indexOf(' ');
                      const emoji = sp > 0 ? p.label.slice(0, sp) : p.label;
                      const name = sp > 0 ? p.label.slice(sp + 1) : p.label;
                      const img = (p as { image?: string }).image;
                      return (
                        <button
                          key={p.label}
                          onClick={() => setDest({ label: p.label, lat: p.lat, lng: p.lng, forfait: p.forfait })}
                          className="relative h-[110px] rounded-[14px] overflow-hidden active:scale-[0.99]"
                          style={{ background: 'radial-gradient(130% 130% at 25% 15%, #9d86ff, #7C5CFF 55%, #5b3fd6 100%)' }}
                        >
                          {img ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={img} alt={name} className="absolute inset-0 w-full h-full object-cover" />
                          ) : (
                            <span className="absolute inset-0 grid place-items-center text-[34px]">{emoji}</span>
                          )}
                          <span
                            className="absolute inset-x-0 bottom-0 p-2 text-left"
                            style={{ background: 'linear-gradient(to top, rgba(0,0,0,.75), rgba(0,0,0,0) 60%)' }}
                          >
                            <span className="block text-white text-[12px] font-semibold leading-tight line-clamp-2" style={{ textShadow: '0 1px 3px rgba(0,0,0,.6)' }}>{name}</span>
                            <span className="block text-white text-[13px] font-bold" style={{ textShadow: '0 1px 3px rgba(0,0,0,.6)' }}>{eur(p.forfait)}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {PRESETS.map((p) => (
                      <button key={p.label} onClick={() => setDest({ label: p.label, lat: p.lat, lng: p.lng, forfait: p.forfait })}
                        className="w-full flex items-center justify-between gap-2 bg-black/[0.04] hover:bg-black/[0.04] rounded-xl px-3 py-2.5 active:scale-[0.99]">
                        <span className="text-[13px] text-[#6A7585]">{p.label}</span>
                        <span className="text-[13px] font-bold text-red-300">{eur(p.forfait)}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="bg-black/[0.04] rounded-2xl p-4 space-y-3">
            <div className="flex items-start gap-3">
              <div className="flex flex-col items-center pt-1.5 shrink-0">
                <span className="w-2.5 h-2.5 rounded-full bg-red-400" />
                <span className="w-px h-5 bg-white/20 my-0.5" />
                <span className="w-2.5 h-2.5 rounded-sm bg-emerald-400" />
              </div>
              <div className="min-w-0 flex-1 space-y-2.5">
                <p className="text-[13px] text-[#9DAAB7] truncate">Ma position</p>
                <p className="text-[14px] text-[#6A7585] truncate">{dest.label}</p>
              </div>
              <button onClick={() => setDest(null)} className="text-red-300 text-[12px] shrink-0">Changer</button>
            </div>
            {estimate && (
              <div className="flex items-center justify-between border-t border-[#E7EAF0] pt-3">
                <span className="text-gray-400 text-[12px]">{estimate.km.toFixed(1)} km · ~{estimate.etaMin} min</span>
                <span className="text-[#2F343A] font-bold text-[20px]">≈ {eur(estimate.fareCents)}</span>
              </div>
            )}
            <button
              onClick={() => handleRequestRide()}
              disabled={!position}
              className="w-full bg-[#FF7F11] hover:bg-[#E86F00] text-[#2F343A] rounded-xl py-3 font-semibold transition-colors active:scale-95 disabled:opacity-40"
            >
              Commander la course{estimate ? ` · ≈ ${eur(estimate.fareCents)}` : ''}
            </button>
            <p className="text-center text-gray-500 text-[11px]">Prix indicatif · paiement cash à bord</p>
          </div>
        )}

        <h3 className="text-[#2F343A] font-medium text-lg pt-1">Chauffeurs proches</h3>

        {sorted.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-8 text-gray-400">
            <Car className="w-8 h-8" />
            <p className="text-sm">Aucun chauffeur à proximité</p>
            <button
              onClick={getPosition}
              className="flex items-center gap-2 text-red-400 hover:text-red-300 text-sm transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Rafraîchir</span>
            </button>
          </div>
        )}

        {sorted.map((driver) => {
          const vehicle = regionVehicles.find((v) => v.key === driver.vehicle_type);
          return (
            <div
              key={driver.peer.id}
              className="bg-black/[0.04] hover:bg-black/[0.04] rounded-2xl p-4 transition-colors cursor-pointer active:scale-[0.98]"
              onClick={() => handleRequestRide(driver.peer.id)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-[#FF7F11]/20 flex items-center justify-center text-xl">
                    {vehicle?.emoji || '🚗'}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-[#2F343A] font-medium">{driver.peer.display_name || driver.peer.username}</p>
                      {driver.favorite && <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />}
                    </div>
                    <p className="text-gray-400 text-sm">
                      {vehicle?.label || driver.vehicle_type} · {driver.distance_km.toFixed(1)} km
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleToggleFavorite(driver.peer.id, driver.favorite);
                    }}
                    className="p-2 hover:bg-black/[0.04] rounded-xl transition-colors"
                  >
                    {driver.favorite ? (
                      <StarOff className="w-4 h-4 text-yellow-400" />
                    ) : (
                      <Star className="w-4 h-4 text-gray-400" />
                    )}
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCall(driver.peer);
                    }}
                    className="p-2 hover:bg-black/[0.04] rounded-xl transition-colors"
                  >
                    <Phone className="w-4 h-4 text-gray-400" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}

      </div>
    );
  };

  // Rendu des demandes (chauffeur)
  const renderDriverRequests = () => {
    if (!driverData) return null;

    if (driverData.active) {
      // Course active
      const ride = driverData.active;
      const statusText = STATUS_LABELS[ride.status] || ride.status;
      const rider = ride.rider;

      return (
        <div className="space-y-4">
          <div className="flex items-center gap-3 bg-black/[0.04] rounded-2xl p-4">
            <div className={`w-3 h-3 rounded-full ${ride.status === 'acceptee' ? 'bg-red-400 animate-pulse' : ride.status === 'en_route' ? 'bg-blue-400 animate-pulse' : ride.status === 'a_bord' ? 'bg-green-400' : 'bg-gray-400'}`} />
            <span className="text-[#2F343A] font-medium">{statusText}</span>
          </div>

          {rider && (
            <div className="bg-black/[0.04] rounded-2xl p-4 space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-[#FF7F11]/20 flex items-center justify-center">
                  <User className="w-6 h-6 text-red-400" />
                </div>
                <div>
                  <p className="text-[#2F343A] font-medium">{rider.display_name || rider.username}</p>
                  <p className="text-gray-400 text-sm">Passager</p>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => handleCall(rider)}
                  className="flex-1 flex items-center justify-center gap-2 bg-[#FF7F11]/20 hover:bg-[#FF7F11]/30 text-red-300 rounded-xl py-2 transition-colors active:scale-95"
                >
                  <Phone className="w-4 h-4" />
                  <span className="text-sm">Appeler</span>
                </button>
                <button
                  onClick={() => handleSms(rider)}
                  className="flex-1 flex items-center justify-center gap-2 bg-black/[0.04] hover:bg-white/20 text-[#2F343A] rounded-xl py-2 transition-colors active:scale-95"
                >
                  <MessageSquare className="w-4 h-4" />
                  <span className="text-sm">SMS</span>
                </button>
              </div>
            </div>
          )}

          {/* Progression des statuts */}
          <div className="space-y-2">
            {ride.status === 'acceptee' && (
              <button
                onClick={() => handleDriverStatus(ride.id, 'en_route')}
                className="w-full bg-[#FF7F11] hover:bg-[#E86F00] text-[#2F343A] rounded-xl py-3 font-medium transition-colors active:scale-95"
              >
                <Navigation className="w-4 h-4 inline mr-2" />
                Je pars
              </button>
            )}
            {ride.status === 'en_route' && (
              <button
                onClick={() => handleDriverStatus(ride.id, 'a_bord')}
                className="w-full bg-green-500 hover:bg-green-600 text-[#2F343A] rounded-xl py-3 font-medium transition-colors active:scale-95"
              >
                <User className="w-4 h-4 inline mr-2" />
                Passager à bord
              </button>
            )}
            {ride.status === 'a_bord' && (
              <button
                onClick={() => handleDriverStatus(ride.id, 'terminee')}
                className="w-full bg-blue-500 hover:bg-blue-600 text-[#2F343A] rounded-xl py-3 font-medium transition-colors active:scale-95"
              >
                <MapPin className="w-4 h-4 inline mr-2" />
                Terminer
              </button>
            )}
            {ride.status !== 'terminee' && ride.status !== 'annulee' && (
              <button
                onClick={() => handleDriverStatus(ride.id, 'annulee')}
                className="w-full bg-[#FF7F11]/20 hover:bg-[#FF7F11]/30 text-red-300 rounded-xl py-2 transition-colors active:scale-95"
              >
                Annuler
              </button>
            )}
          </div>

          <p className="text-center text-gray-500 text-xs">Paiement : cash à bord</p>
        </div>
      );
    }

    // Demandes en attente
    return (
      <div className="space-y-3">
        <h3 className="text-[#2F343A] font-medium text-lg">Demandes en attente</h3>

        {driverData.requests.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-8 text-gray-400">
            <Clock className="w-8 h-8" />
            <p className="text-sm">Aucune demande pour le moment</p>
          </div>
        )}

        {driverData.requests.map((req) => {
          const rider = req.rider;
          return (
            <div key={req.id} className="bg-black/[0.04] rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-12 h-12 rounded-full bg-[#FF7F11]/20 flex items-center justify-center shrink-0">
                    <User className="w-6 h-6 text-red-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[#2F343A] font-medium truncate">{rider?.display_name || rider?.username || 'Passager'}</p>
                    {req.distance_m != null && <p className="text-gray-400 text-sm">{(req.distance_m / 1000).toFixed(1)} km</p>}
                  </div>
                </div>
                {req.fare_cents != null && <span className="text-emerald-300 font-bold text-[18px] shrink-0">≈ {eur(req.fare_cents)}</span>}
              </div>

              {/* Trajet prise → destination */}
              <div className="flex items-start gap-3">
                <div className="flex flex-col items-center pt-1.5 shrink-0">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-400" />
                  <span className="w-px h-5 bg-white/20 my-0.5" />
                  <span className="w-2.5 h-2.5 rounded-sm bg-emerald-400" />
                </div>
                <div className="min-w-0 flex-1 space-y-2">
                  <p className="text-[13px] text-[#6A7585] truncate">{req.pickup_label || 'Point de prise'}</p>
                  <p className="text-[13px] text-[#6A7585] truncate">{req.dropoff_label || 'Destination non précisée'}</p>
                </div>
              </div>

              <button
                onClick={() => handleAcceptRequest(req.id)}
                className="w-full bg-[#FF7F11] hover:bg-[#E86F00] text-[#2F343A] rounded-xl py-2.5 font-semibold transition-colors active:scale-95"
              >
                Accepter{req.fare_cents != null ? ` · ≈ ${eur(req.fare_cents)}` : ''}
              </button>
            </div>
          );
        })}
      </div>
    );
  };

  // Rendu du panneau chauffeur (paramètres)
  const renderDriverPanel = () => {
    return (
      <div className="space-y-4">
        {/* Ma flotte : déclarer ses véhicules (→ transport_profile.fleet). Porteur implicite : CNI + ≥1 véhicule. */}
        <button onClick={() => setShowFleet(true)} className="w-full flex items-center justify-center gap-2 rounded-xl py-2.5 border border-[#E7EAF0] bg-white text-[#2F343A] text-sm font-medium active:scale-95">
          🚗 Ma flotte — déclarer mes véhicules
        </button>
        {/* Quel véhicule je conduis cette session — parmi MA flotte réelle (Pascal 4b-1). */}
        <div>
          <label className="text-gray-400 text-sm block mb-2">Mon véhicule</label>
          {fleet.length === 0 ? (
            <p className="text-[13px] text-gray-500">Ajoute un véhicule dans <b>Ma flotte</b> pour te mettre en ligne.</p>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {fleet.map((v, i) => {
                const cat = VEHICLE_MAP[v.type];
                return (
                  <button
                    key={i}
                    onClick={() => setDriverVehicleType(v.type)}
                    className={`flex items-center gap-2 p-3 rounded-xl border transition-all active:scale-95 ${
                      driverVehicleType === v.type
                        ? 'border-red-500 bg-[#FF7F11]/20 text-[#2F343A]'
                        : 'border-[#E7EAF0] bg-black/[0.04] text-gray-300 hover:bg-black/[0.04]'
                    }`}
                  >
                    <span className="text-xl">{cat?.emoji || '🚗'}</span>
                    <span className="text-sm">{cat?.label || v.type}{v.plate ? ` · ${v.plate}` : ''}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Toggle en ligne */}
        <button
          onClick={handleToggleOnline}
          className={`w-full flex items-center justify-center gap-2 rounded-xl py-3 font-medium transition-colors active:scale-95 ${
            driverOnline
              ? 'bg-green-500/20 text-green-300 hover:bg-green-500/30'
              : 'bg-[#FF7F11] hover:bg-[#E86F00] text-[#2F343A]'
          }`}
        >
          <div className={`w-3 h-3 rounded-full ${driverOnline ? 'bg-green-400 animate-pulse' : 'bg-gray-400'}`} />
          <span>{driverOnline ? 'En ligne' : 'Passer en ligne'}</span>
        </button>

        {driverOnline && (
          <p className="text-center text-gray-500 text-xs">
            Position partagée en temps réel · {driverVehicleType}
          </p>
        )}
      </div>
    );
  };

  // Contenu du bottom sheet selon le mode
  const renderSheetContent = () => {
    if (mode === 'passenger') {
      if (activeRide) return renderRideStatus();
      return renderNearbyDrivers();
    } else {
      if (driverData?.active || (driverData?.requests && driverData.requests.length > 0)) {
        return renderDriverRequests();
      }
      return renderDriverPanel();
    }
  };

  return (
    <div className="relative h-screen w-full bg-[#F5F6F8] overflow-hidden">
      {/* Carte plein écran — z-0 crée un contexte d'empilement qui PIÈGE les
          contrôles Leaflet (z-1000 interne) sous le header/sheet (z-10/20). */}
      <div className="absolute inset-0 z-0">
        <DriveMap
          center={position}
          markers={buildMarkers()}
          route={mode === 'passenger' && !activeRide ? routeLine : undefined}
          className="w-full h-full"
        />
      </div>

      {/* Header flottant */}
      <div className="absolute top-0 inset-x-0 lg:max-w-md lg:mx-auto z-20 p-4">
        <div className="flex items-center justify-between">
          <button
            onClick={() => router.push('/home')}
            className="w-10 h-10 rounded-xl bg-black/50 backdrop-blur-md flex items-center justify-center hover:bg-black/70 transition-colors active:scale-95"
          >
            <ChevronLeft className="w-5 h-5 text-white" />
          </button>

          {/* Switch Passager/Chauffeur */}
          <div className="flex bg-black/50 backdrop-blur-md rounded-full p-1">
            <button
              onClick={() => setMode('passenger')}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
                mode === 'passenger' ? 'bg-[#FF7F11] text-[#2F343A]' : 'text-gray-400 hover:text-[#2F343A]'
              }`}
            >
              Passager
            </button>
            <button
              onClick={() => setMode('driver')}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
                mode === 'driver' ? 'bg-[#FF7F11] text-[#2F343A]' : 'text-gray-400 hover:text-[#2F343A]'
              }`}
            >
              Chauffeur
            </button>
            <button
              onClick={() => router.push('/envoyer-colis')}
              className="px-4 py-1.5 rounded-full text-sm font-medium transition-all text-gray-400 hover:text-[#2F343A]"
            >
              Envoyer
            </button>
          </div>

          {/* Espace pour équilibrer */}
          <div className="w-10" />
        </div>
      </div>

      {/* Erreur de géolocalisation */}
      {geoError && (
        <div className="absolute top-20 left-4 right-4 z-20 bg-[#FF7F11]/20 backdrop-blur-md rounded-2xl p-4 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-300 flex-shrink-0" />
          <p className="text-red-200 text-sm flex-1">{geoError}</p>
          <button
            onClick={getPosition}
            className="flex items-center gap-1 text-red-300 hover:text-red-200 text-sm transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Réessayer</span>
          </button>
        </div>
      )}

      {/* Bottom sheet */}
      <div className="absolute bottom-0 inset-x-0 lg:max-w-md lg:mx-auto z-10 max-h-[70vh] lg:max-h-[46vh] overflow-y-auto">
        <div className="bg-[#F5F6F8] backdrop-blur-xl rounded-t-3xl shadow-2xl border-t border-[#E7EAF0]">
          {/* Poignée */}
          <div className="flex justify-center pt-3 pb-2">
            <div className="w-10 h-1 rounded-full bg-white/20" />
          </div>

          {/* Contenu */}
          <div className="px-4 pb-8">
            {renderSheetContent()}
          </div>
        </div>
      </div>

      {/* « Objet/Transport » → UN seul « Envoyer » = /envoyer-colis (escrow, canonique). TransportFeed rangé au labo. Phase 4a (Pascal 2026-08-10). */}

      {/* Location de véhicules (avec/sans chauffeur) — Pascal 2026-06-26 */}
      {showRentals && <RentalSheet onClose={() => setShowRentals(false)} />}
      {/* Planning propriétaire (Phase 1) */}
      {showMyRentals && <MyRentalsSheet onClose={() => setShowMyRentals(false)} />}
      {/* Colis de ma zone (référent) — Pascal 2026-07-28 */}
      {showReferentColis && <ReferentColisSheet onClose={() => setShowReferentColis(false)} />}
      {/* Ma flotte (Drive Phase 2) — déclarer ses véhicules ; gate CNI → renvoi Mon Compte. */}
      {showFleet && <FleetSheet onClose={() => { setShowFleet(false); }} />}
    </div>
  );
}
