// Per-state fallback estimates — used when TollEstimator can't find an exact DB match for a route segment.
// Values are 5-axle semi, E-ZPass-equivalent, cents per mile. Source: each state's published 2025–2026
// schedule averaged across the system. Refresh annually alongside the official scrapers.

export const ESTIMATED_TRUCK_RATE_CENTS_PER_MILE: Record<string, number> = {
  PA: 23,
  OH: 23,
  NY: 19,
  NJ: 28,
  FL: 15,
  TX: 12,
  IL: 16,
  IN: 9,
  MA: 14,
  MD: 10,
  VA: 8,
  WV: 7,
  ME: 9,
  NH: 8,
  DE: 18,
  KS: 6,
  OK: 5,
  GA: 7,
  CO: 9,
  NC: 5,
  CA: 6,
};

/** Multiplier vs the 5-axle E-ZPass base rate, by truck class enum value. */
import type { TruckClass } from "@prisma/client";

export const AXLE_MULTIPLIER: Record<TruckClass, number> = {
  STRAIGHT: 0.55,
  SEMI: 1.0,
  FLATBED: 1.0,
  REEFER: 1.0,
  TANKER: 1.05,
  LOWBOY: 1.18,
};

/** Cash / Toll-By-Plate uplift over E-ZPass — most authorities run 30–50%. */
export const PAYMENT_UPLIFT: Record<string, number> = {
  ezpass: 1.0,
  prepass: 1.0,
  cash: 1.4,
  platemail: 1.5,
};

/** PrePass coverage — 44 US states as of 2026. Used for weigh-station bypass eligibility. */
export const PREPASS_STATES: ReadonlySet<string> = new Set([
  "AL", "AR", "AZ", "CA", "CO", "CT", "DE", "FL", "GA", "ID", "IL", "IN", "IA",
  "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV",
  "NH", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "SC", "SD", "TN", "TX",
  "UT", "VA", "WA", "WV", "WI",
]);

/** Truck class → axle count default. */
export function defaultAxleCountFor(truckClass: TruckClass): number {
  switch (truckClass) {
    case "STRAIGHT":
      return 2;
    case "SEMI":
    case "FLATBED":
    case "REEFER":
      return 5;
    case "TANKER":
      return 5;
    case "LOWBOY":
      return 6;
    default:
      return 5;
  }
}

/** Truck class → normalized vehicle class string used in TollRate.vehicleClass. */
import type { VehicleClass } from "@/lib/toll/types";

export function vehicleClassFor(truckClass: TruckClass): VehicleClass {
  switch (truckClass) {
    case "STRAIGHT":
      return "class2_2axle_truck";
    case "SEMI":
    case "FLATBED":
    case "REEFER":
    case "TANKER":
      return "class5_5axle_semi";
    case "LOWBOY":
      return "class6_6axle";
    default:
      return "class5_5axle_semi";
  }
}
