// Fuel-cost math. Blends per-state diesel averages along the route corridor against truck mpg.

import type { TruckClass } from "@prisma/client";
import type { FuelEstimate } from "@/lib/types";
import { DIESEL_FALLBACK_USD, MPG_DEFAULTS, STATE_DIESEL_AVG } from "@/lib/utils/constants";

export interface FuelEstimateInput {
  miles: number;
  truckClass: TruckClass;
  /** Two-letter state codes the route passes through, in order. May be empty. */
  corridorStates: string[];
}

export function estimateFuel({ miles, truckClass, corridorStates }: FuelEstimateInput): FuelEstimate {
  const mpg = MPG_DEFAULTS[truckClass] ?? MPG_DEFAULTS.SEMI;
  const gallons = miles / mpg;
  const prices = corridorStates
    .map((s) => STATE_DIESEL_AVG[s.toUpperCase()])
    .filter((p): p is number => typeof p === "number");
  const pricePerGallon = prices.length > 0 ? prices.reduce((a, b) => a + b, 0) / prices.length : DIESEL_FALLBACK_USD;
  return {
    gallons,
    pricePerGallon,
    totalUsd: gallons * pricePerGallon,
    statesUsed: prices.length > 0 ? corridorStates : [],
  };
}
