// Geographic helpers used by route corridor projection (haversine great-circle distance, polyline cumulative miles).

const EARTH_RADIUS_MI = 3958.8;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Great-circle distance between two lat/lng points, in miles. */
export function haversineMiles(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h = sinLat * sinLat + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinLng * sinLng;
  return 2 * EARTH_RADIUS_MI * Math.asin(Math.min(1, Math.sqrt(h)));
}

export interface CorridorProjection {
  /** Cumulative miles along the polyline at the closest vertex to the point. */
  mileMarker: number;
  /** How far the point sits off the corridor, in miles. */
  offCorridor: number;
}

/** Project a single point onto a polyline of [lng, lat] coordinates. */
export function projectOntoPolyline(
  point: { lat: number; lng: number },
  polyline: Array<[number, number]>,
): CorridorProjection {
  let cum = 0;
  let bestDist = Infinity;
  let cumAtBest = 0;
  for (let i = 0; i < polyline.length; i++) {
    const [lng, lat] = polyline[i]!;
    if (i > 0) {
      const [plng, plat] = polyline[i - 1]!;
      cum += haversineMiles({ lat: plat, lng: plng }, { lat, lng });
    }
    const d = haversineMiles(point, { lat, lng });
    if (d < bestDist) {
      bestDist = d;
      cumAtBest = cum;
    }
  }
  return { mileMarker: cumAtBest, offCorridor: bestDist };
}
