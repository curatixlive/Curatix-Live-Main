/**
 * Distance from the viewer to a venue.
 *
 * Shown only when BOTH ends are real: the browser has granted location and
 * produced a fix, and the organiser pinned the venue. A missing coordinate is
 * never replaced by a default — (0, 0) is a real place in the Atlantic, so a
 * fallback would be a confident lie rather than an approximation.
 */

const EARTH_RADIUS_KM = 6371.0088;

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

/** Great-circle distance in kilometres (haversine). */
export function haversineKm(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const dLat = toRadians(b.latitude - a.latitude);
  const dLon = toRadians(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(a.latitude)) * Math.cos(toRadians(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** API coordinates arrive as numbers or decimal strings; anything else is absent. */
export function parseCoordinate(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

/** A pinned venue as a point, or null unless BOTH coordinates are real and in range. */
export function venuePoint(venue: {
  latitude?: number | string | null;
  longitude?: number | string | null;
}): { latitude: number; longitude: number } | null {
  const latitude = parseCoordinate(venue.latitude);
  const longitude = parseCoordinate(venue.longitude);
  if (latitude === null || longitude === null) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return { latitude, longitude };
}

/** "850 m away", "3.2 km away", "42 km away" — rounded so it never claims precision it lacks. */
export function formatDistance(km: number): string {
  if (!Number.isFinite(km) || km < 0) return '';
  if (km < 1) return `${Math.max(50, Math.round((km * 1000) / 50) * 50)} m away`;
  if (km < 10) return `${km.toFixed(1)} km away`;
  return `${Math.round(km).toLocaleString('en-IN')} km away`;
}
