/**
 * Talk2Me — position de l'acheteur pour le calcul de livraison (Pascal 2026-06-24).
 * Best-effort : si refusé/indispo → null (la livraison retombe à 0, on n'invente pas).
 */
export function getPosition(timeoutMs = 8000): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: false, timeout: timeoutMs, maximumAge: 300000 },
    );
  });
}
