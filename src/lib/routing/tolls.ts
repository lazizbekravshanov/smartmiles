// Toll cost estimation. Detects toll-tagged ways via Overpass, projects each way onto the route polyline,
// and looks up the named turnpike in a static 5-axle E-ZPass rate table. Approximate by design — flagged
// to the user as "≈ 5-axle E-ZPass est". No external paid API. Refresh the rate table annually.

import { queryTollWays, type TollWay } from "@/lib/routing/overpass";
import { haversineMiles } from "@/lib/utils/geo";
import type { TollResult, TollSegment } from "@/lib/types";
import type { TruckClass } from "@prisma/client";

/**
 * Approximate per-mile toll rates for a 5-axle semi on E-ZPass / electronic-tag pricing.
 * Matched against OSM `name` tag (case-insensitive substring). Refresh annually — actual rates
 * vary by entry/exit pair, time of day on a few corridors, and axle count above 5.
 *
 * Source: each turnpike's published 2026 truck-toll schedule (E-ZPass / ITAG / I-PASS).
 */
const TURNPIKE_RATES_5AXLE: Array<{ match: string; ratePerMile: number }> = [
  { match: "Pennsylvania Turnpike", ratePerMile: 0.45 },
  { match: "New Jersey Turnpike", ratePerMile: 0.40 },
  { match: "Ohio Turnpike", ratePerMile: 0.32 },
  { match: "New York State Thruway", ratePerMile: 0.30 },
  { match: "Indiana Toll Road", ratePerMile: 0.30 },
  { match: "Massachusetts Turnpike", ratePerMile: 0.30 },
  { match: "Illinois Tollway", ratePerMile: 0.28 },
  { match: "Tri-State Tollway", ratePerMile: 0.28 },
  { match: "Reagan Memorial Tollway", ratePerMile: 0.28 },
  { match: "Jane Addams Memorial Tollway", ratePerMile: 0.28 },
  { match: "Kansas Turnpike", ratePerMile: 0.27 },
  { match: "Maine Turnpike", ratePerMile: 0.25 },
  { match: "Florida's Turnpike", ratePerMile: 0.24 },
  { match: "Florida Turnpike", ratePerMile: 0.24 },
  { match: "New Hampshire Turnpike", ratePerMile: 0.22 },
  { match: "West Virginia Turnpike", ratePerMile: 0.20 },
  { match: "Oklahoma Turnpike", ratePerMile: 0.18 },
  { match: "Pikepass", ratePerMile: 0.18 },
];

/** Per-class multiplier vs the 5-axle base rate. */
const AXLE_MULTIPLIER: Record<TruckClass, number> = {
  STRAIGHT: 0.55, // 2-axle
  SEMI: 1.0,
  FLATBED: 1.0,
  REEFER: 1.0,
  TANKER: 1.05,
  LOWBOY: 1.18, // 6-axle / oversize
};

/** Distance threshold (miles) for a way node to count as "on route". */
const ON_ROUTE_THRESHOLD_MI = 0.6;

function ratePerMileFor(name: string | undefined, truckClass: TruckClass): number | null {
  if (!name) return null;
  const lower = name.toLowerCase();
  for (const t of TURNPIKE_RATES_5AXLE) {
    if (lower.includes(t.match.toLowerCase())) {
      return t.ratePerMile * (AXLE_MULTIPLIER[truckClass] ?? 1.0);
    }
  }
  return null;
}

/**
 * For each way, sum the lengths of consecutive node-pairs where at least one endpoint is on the route.
 * That gives an over-estimate of "on-route mileage" for the way without doing full segment intersection.
 */
function milesOnRoute(way: TollWay, polyline: Array<[number, number]>): number {
  if (way.geometry.length < 2) return 0;
  let total = 0;
  for (let i = 1; i < way.geometry.length; i++) {
    const a = way.geometry[i - 1]!;
    const b = way.geometry[i]!;
    const segMiles = haversineMiles({ lat: a.lat, lng: a.lon }, { lat: b.lat, lng: b.lon });
    const aOn = nearestPolylineDistance({ lat: a.lat, lng: a.lon }, polyline) < ON_ROUTE_THRESHOLD_MI;
    const bOn = nearestPolylineDistance({ lat: b.lat, lng: b.lon }, polyline) < ON_ROUTE_THRESHOLD_MI;
    if (aOn || bOn) total += segMiles;
  }
  return total;
}

function nearestPolylineDistance(point: { lat: number; lng: number }, polyline: Array<[number, number]>): number {
  let best = Infinity;
  for (const [lng, lat] of polyline) {
    const d = haversineMiles(point, { lat, lng });
    if (d < best) best = d;
  }
  return best;
}

export async function estimateTolls(
  routeBbox: [number, number, number, number],
  routeGeometry: Array<[number, number]>,
  truckClass: TruckClass,
): Promise<TollResult> {
  let ways: TollWay[];
  try {
    ways = await queryTollWays(routeBbox, 0.2);
  } catch {
    return { totalEstimatedUsd: 0, totalSegmentCount: 0, uncalculatedCount: 0, segments: [] };
  }

  const aggregates = new Map<string, { miles: number; estimatedUsd: number | null }>();

  for (const way of ways) {
    const miles = milesOnRoute(way, routeGeometry);
    if (miles < 0.5) continue; // skip noise — way not actually on this route
    const name = way.name ?? way.ref ?? "Unnamed toll segment";
    const rate = ratePerMileFor(way.name, truckClass);
    const cost = rate !== null ? miles * rate : null;
    const prev = aggregates.get(name);
    if (prev) {
      prev.miles += miles;
      if (prev.estimatedUsd !== null && cost !== null) prev.estimatedUsd += cost;
    } else {
      aggregates.set(name, { miles, estimatedUsd: cost });
    }
  }

  const segments: TollSegment[] = Array.from(aggregates.entries())
    .map(([name, v]) => ({ name, miles: v.miles, estimatedUsd: v.estimatedUsd }))
    .sort((a, b) => b.miles - a.miles);

  const totalEstimatedUsd = segments.reduce((acc, s) => acc + (s.estimatedUsd ?? 0), 0);
  const uncalculatedCount = segments.filter((s) => s.estimatedUsd === null).length;

  return {
    totalEstimatedUsd,
    totalSegmentCount: segments.length,
    uncalculatedCount,
    segments,
  };
}
