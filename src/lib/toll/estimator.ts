// Master toll estimation engine. DB-first (exact rates from official .gov sources, seeded + scraped),
// falls back to ESTIMATED_TRUCK_RATE_CENTS_PER_MILE × Overpass-detected on-route mileage when the DB
// has no match for a given state. Confidence is high/medium/low based on how much of the route's toll
// mileage we covered with exact DB rates.

import { prisma } from "@/lib/db";
import { matchTollRoads, type MatchedTollRoad } from "@/lib/toll/matcher";
import {
  ESTIMATED_TRUCK_RATE_CENTS_PER_MILE,
  AXLE_MULTIPLIER,
  PAYMENT_UPLIFT,
  PREPASS_STATES,
  defaultAxleCountFor,
  vehicleClassFor,
} from "@/lib/toll/constants";
import type { Bbox } from "@/lib/routing/overpass";
import type { PaymentMethod, VehicleClass } from "@/lib/toll/types";
import type { TruckClass } from "@prisma/client";

export interface TollEstimateInput {
  routeBbox: Bbox;
  routePolyline: Array<[number, number]>;
  /** Two-letter state codes the route passes through (in order). Used for DB authority lookups + fallback. */
  states: string[];
  truckClass: TruckClass;
  paymentMethod: PaymentMethod;
  prepassEnrolled: boolean;
}

export interface TollSegmentHit {
  authorityName: string;
  state: string;
  highway: string;
  entryPoint: string;
  exitPoint: string;
  miles: number;
  rateCents: number;
  paymentMethod: string;
  prepassBypass: boolean;
  sourceUrl: string;
  confidence: "exact" | "estimated";
}

export interface TollEstimateResult {
  totalCents: number;
  totalFormatted: string;
  breakdown: TollSegmentHit[];
  confidence: "high" | "medium" | "low";
  prepassBypassCount: number;
  unmatchedTollRoads: MatchedTollRoad[];
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/** Match an OSM road name (e.g. "Pennsylvania Turnpike") against a TollAuthority by substring. */
function authorityMatchesName(authorityName: string, osmName: string): boolean {
  const a = authorityName.toLowerCase();
  const o = osmName.toLowerCase();
  if (o.includes(a)) return true;
  // Common short forms
  if (a.includes("pennsylvania turnpike") && o.includes("pennsylvania turnpike")) return true;
  if (a.includes("ohio turnpike") && o.includes("ohio turnpike")) return true;
  if (a.includes("new jersey turnpike") && o.includes("new jersey turnpike")) return true;
  if (a.includes("new york state thruway") && o.includes("thruway")) return true;
  if (a.includes("indiana toll road") && o.includes("indiana toll road")) return true;
  if (a.includes("illinois") && (o.includes("tri-state") || o.includes("reagan") || o.includes("jane addams") || o.includes("veterans memorial"))) return true;
  if (a.includes("massachusetts") && o.includes("turnpike")) return true;
  if (a.includes("kansas turnpike") && o.includes("kansas turnpike")) return true;
  if (a.includes("oklahoma") && o.includes("turnpike")) return true;
  if (a.includes("maine turnpike") && o.includes("maine turnpike")) return true;
  if (a.includes("florida")) return o.includes("florida") || o.includes("turnpike");
  return false;
}

export async function estimateToll(input: TollEstimateInput): Promise<TollEstimateResult> {
  const matched = await matchTollRoads(input.routeBbox, input.routePolyline);
  const vehicleClass: VehicleClass = vehicleClassFor(input.truckClass);
  const axleCount = defaultAxleCountFor(input.truckClass);
  const axleMult = AXLE_MULTIPLIER[input.truckClass] ?? 1.0;
  const paymentUplift = PAYMENT_UPLIFT[input.paymentMethod] ?? 1.0;

  if (matched.length === 0) {
    return {
      totalCents: 0,
      totalFormatted: "$0.00",
      breakdown: [],
      confidence: "high",
      prepassBypassCount: 0,
      unmatchedTollRoads: [],
    };
  }

  const breakdown: TollSegmentHit[] = [];
  const unmatched: MatchedTollRoad[] = [];
  let exactCoveredMiles = 0;

  for (const road of matched) {
    let hit: TollSegmentHit | null = null;

    // Try DB lookup: find authorities whose name matches the OSM road name and pull a rate.
    const authorities = await prisma.tollAuthority.findMany({
      where: { tollFree: false },
      include: {
        segments: {
          include: {
            rates: {
              where: { vehicleClass, paymentMethod: input.paymentMethod },
              orderBy: { effectiveDate: "desc" },
              take: 1,
            },
          },
        },
      },
    });

    const matchingAuth = authorities.find((a) => authorityMatchesName(a.name, road.name));
    if (matchingAuth) {
      // Find a rate — prefer per-mile so we can scale to actual road.miles
      let perMileRate: number | undefined;
      let flatRate: { rateCents: number; sourceUrl: string; segment: { highway: string; entryPointName: string; exitPointName: string } } | undefined;
      for (const seg of matchingAuth.segments) {
        const rate = seg.rates[0];
        if (!rate) continue;
        if (rate.ratePerMileCents !== null && rate.ratePerMileCents !== undefined) {
          perMileRate = rate.ratePerMileCents;
          break;
        }
        if (!flatRate) {
          flatRate = {
            rateCents: rate.rateCents,
            sourceUrl: rate.sourceUrl,
            segment: { highway: seg.highway, entryPointName: seg.entryPointName, exitPointName: seg.exitPointName },
          };
        }
      }
      if (perMileRate !== undefined) {
        const cost = Math.round(road.miles * perMileRate * axleMult * paymentUplift);
        hit = {
          authorityName: matchingAuth.name,
          state: matchingAuth.state,
          highway: matchingAuth.highways[0] ?? road.ref ?? "",
          entryPoint: `route entry`,
          exitPoint: `route exit`,
          miles: road.miles,
          rateCents: cost,
          paymentMethod: input.paymentMethod,
          prepassBypass: matchingAuth.prepassAccepted && input.prepassEnrolled,
          sourceUrl: matchingAuth.rateScheduleUrl,
          confidence: "exact",
        };
        exactCoveredMiles += road.miles;
      } else if (flatRate) {
        const cost = Math.round(flatRate.rateCents * axleMult * paymentUplift);
        hit = {
          authorityName: matchingAuth.name,
          state: matchingAuth.state,
          highway: flatRate.segment.highway,
          entryPoint: flatRate.segment.entryPointName,
          exitPoint: flatRate.segment.exitPointName,
          miles: road.miles,
          rateCents: cost,
          paymentMethod: input.paymentMethod,
          prepassBypass: matchingAuth.prepassAccepted && input.prepassEnrolled,
          sourceUrl: flatRate.sourceUrl,
          confidence: "exact",
        };
        exactCoveredMiles += road.miles;
      }
    }

    // Fallback: per-state cents-per-mile estimate
    if (!hit) {
      const stateGuess = matchingAuth?.state ?? input.states.find((s) => ESTIMATED_TRUCK_RATE_CENTS_PER_MILE[s] !== undefined);
      if (stateGuess && ESTIMATED_TRUCK_RATE_CENTS_PER_MILE[stateGuess] !== undefined) {
        const baseRate = ESTIMATED_TRUCK_RATE_CENTS_PER_MILE[stateGuess]!;
        const cost = Math.round(road.miles * baseRate * axleMult * paymentUplift);
        hit = {
          authorityName: matchingAuth?.name ?? `${stateGuess} (estimated)`,
          state: stateGuess,
          highway: road.ref ?? "",
          entryPoint: "route entry (est)",
          exitPoint: "route exit (est)",
          miles: road.miles,
          rateCents: cost,
          paymentMethod: input.paymentMethod,
          prepassBypass: PREPASS_STATES.has(stateGuess) && input.prepassEnrolled,
          sourceUrl: matchingAuth?.rateScheduleUrl ?? "",
          confidence: "estimated",
        };
      } else {
        unmatched.push(road);
        continue;
      }
    }
    breakdown.push(hit);
  }

  const totalMiles = matched.reduce((acc, m) => acc + m.miles, 0);
  const exactRatio = totalMiles > 0 ? exactCoveredMiles / totalMiles : 0;
  const confidence: "high" | "medium" | "low" =
    exactRatio >= 0.8 ? "high" : exactRatio > 0 ? "medium" : "low";
  const totalCents = breakdown.reduce((acc, b) => acc + b.rateCents, 0);
  const prepassBypassCount = breakdown.filter((b) => b.prepassBypass).length;
  void axleCount;

  return {
    totalCents,
    totalFormatted: formatCents(totalCents),
    breakdown,
    confidence,
    prepassBypassCount,
    unmatchedTollRoads: unmatched,
  };
}
