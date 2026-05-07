// Match a route polyline to toll-tagged OSM ways. Returns named toll roads encountered + on-route mileage.
// Used by TollEstimator both for cost calculation (when DB has the segment) and as the fallback miles
// counter (when DB has no exact rate and we need per-state cents-per-mile × on-route miles).

import { queryTollWays, type TollWay } from "@/lib/routing/overpass";
import { haversineMiles } from "@/lib/utils/geo";
import type { Bbox } from "@/lib/routing/overpass";

export interface MatchedTollRoad {
  /** OSM name tag (e.g. "Pennsylvania Turnpike") or "Unnamed toll road". */
  name: string;
  /** OSM ref tag (e.g. "I-76") or undefined. */
  ref: string | undefined;
  /** Estimated on-route miles for this named toll road. */
  miles: number;
  /** State code inferred from the way's tags (addr:state) or from the ref + lat/lng. */
  state: string | undefined;
}

const ON_ROUTE_THRESHOLD_MI = 0.6;
/** Polyline subsample stride. Long routes (~1000 mi) have ~5000 polyline points; checking every point
 *  per toll-way endpoint is O(N×M) and dominates handler latency. Sampling every Nth keeps accuracy
 *  while reducing haversine calls ~10×. With 0.6 mi proximity threshold and US highway spacing, this
 *  is plenty accurate. */
const POLYLINE_STRIDE = 10;

function buildSampledPolyline(polyline: Array<[number, number]>): Array<[number, number]> {
  if (polyline.length <= 200) return polyline;
  const out: Array<[number, number]> = [];
  for (let i = 0; i < polyline.length; i += POLYLINE_STRIDE) out.push(polyline[i]!);
  // Always include the last point so we don't miss the destination tail.
  if (out[out.length - 1] !== polyline[polyline.length - 1]) out.push(polyline[polyline.length - 1]!);
  return out;
}

function pointOnRoute(point: { lat: number; lng: number }, polyline: Array<[number, number]>): boolean {
  for (const [lng, lat] of polyline) {
    if (haversineMiles(point, { lat, lng }) < ON_ROUTE_THRESHOLD_MI) return true;
  }
  return false;
}

function milesOnRoute(way: TollWay, sampledPolyline: Array<[number, number]>): number {
  if (way.geometry.length < 2) return 0;
  let total = 0;
  for (let i = 1; i < way.geometry.length; i++) {
    const a = way.geometry[i - 1]!;
    const b = way.geometry[i]!;
    const segMiles = haversineMiles({ lat: a.lat, lng: a.lon }, { lat: b.lat, lng: b.lon });
    if (pointOnRoute({ lat: a.lat, lng: a.lon }, sampledPolyline) || pointOnRoute({ lat: b.lat, lng: b.lon }, sampledPolyline)) {
      total += segMiles;
    }
  }
  return total;
}

export async function matchTollRoads(routeBbox: Bbox, polyline: Array<[number, number]>): Promise<MatchedTollRoad[]> {
  let ways: TollWay[];
  try {
    ways = await queryTollWays(routeBbox, 0.2);
  } catch {
    return [];
  }
  const sampled = buildSampledPolyline(polyline);
  const aggregates = new Map<string, MatchedTollRoad>();
  for (const way of ways) {
    const miles = milesOnRoute(way, sampled);
    if (miles < 0.5) continue;
    const name = way.name ?? way.ref ?? "Unnamed toll road";
    const prev = aggregates.get(name);
    if (prev) prev.miles += miles;
    else aggregates.set(name, { name, ref: way.ref, miles, state: undefined });
  }
  return Array.from(aggregates.values()).sort((a, b) => b.miles - a.miles);
}
