import type { GeoPoint } from "@agroassure/domain";

// Check-in geofencing. On arrival the device compares where it is with the
// facility's registered point and records the distance. A check-in beyond the
// configured distance is flagged for the supervisor rather than refused: the
// inspector is standing where they are standing, and a registry point can be
// wrong, stale, or never captured. The record reflects reality and says so.

const EARTH_RADIUS_M = 6_371_008.8;

/** Great-circle distance in metres. */
export function distanceMetres(a: GeoPoint, b: GeoPoint): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export interface CheckinResult {
  distanceFromRegisteredM: number;
  flagged: boolean;
  /** Why it was flagged, in words, for the supervisor who has to judge it. */
  reason: string | null;
}

/** Default radius within which a check-in is unremarkable. */
export const DEFAULT_GEOFENCE_M = 250;

export function evaluateCheckin(
  actual: GeoPoint,
  registered: GeoPoint | null,
  geofenceM: number = DEFAULT_GEOFENCE_M,
): CheckinResult {
  if (!registered) {
    // A facility onboarded from paper may have no registered point yet. The
    // first visit captures one; there is nothing to be off by until then.
    return { distanceFromRegisteredM: 0, flagged: false, reason: null };
  }

  const distance = Math.round(distanceMetres(actual, registered));
  if (distance <= geofenceM) {
    return { distanceFromRegisteredM: distance, flagged: false, reason: null };
  }

  return {
    distanceFromRegisteredM: distance,
    flagged: true,
    reason: `check-in ${distance}m from the registered point (limit ${geofenceM}m)`,
  };
}
