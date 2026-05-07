// Static reference data: state diesel averages, default mpg per truck class, weigh-station enforcement density.
// State diesel averages are 2026-Q2 illustrative figures — refresh monthly from EIA gasdiesel data when wired up.

import type { TruckClass } from "@prisma/client";

/** USD per gallon, by US state code. Refresh monthly from eia.gov/petroleum/gasdiesel/. */
export const STATE_DIESEL_AVG: Record<string, number> = {
  AL: 3.42, AK: 3.95, AZ: 3.71, AR: 3.45, CA: 4.89,
  CO: 3.62, CT: 4.05, DE: 3.74, FL: 3.62, GA: 3.49,
  HI: 5.12, ID: 3.74, IL: 3.72, IN: 3.61, IA: 3.55,
  KS: 3.42, KY: 3.55, LA: 3.41, ME: 3.86, MD: 3.78,
  MA: 4.01, MI: 3.77, MN: 3.62, MS: 3.40, MO: 3.45,
  MT: 3.78, NE: 3.55, NV: 4.18, NH: 3.78, NJ: 3.79,
  NM: 3.59, NY: 4.12, NC: 3.55, ND: 3.65, OH: 3.58,
  OK: 3.41, OR: 4.32, PA: 3.71, RI: 3.92, SC: 3.45,
  SD: 3.62, TN: 3.49, TX: 3.38, UT: 3.84, VT: 3.95,
  VA: 3.58, WA: 4.45, WV: 3.74, WI: 3.62, WY: 3.78,
  // District of Columbia
  DC: 4.05,
  // Canadian provinces (USD/gal equivalent — converted from CAD/L). Refresh quarterly.
  AB: 3.85, BC: 4.95, MB: 4.10, NB: 4.55, NL: 4.78,
  NS: 4.62, NT: 5.20, NU: 5.85, ON: 4.42, PE: 4.55,
  QC: 4.65, SK: 4.05, YT: 5.05,
};

/** Fallback diesel price when we can't determine corridor states. */
export const DIESEL_FALLBACK_USD = 3.65;

/** Default fuel economy in miles per gallon, indexed by Prisma TruckClass enum value. */
export const MPG_DEFAULTS: Record<TruckClass, number> = {
  STRAIGHT: 8.0,
  SEMI: 6.5,
  FLATBED: 6.3,
  REEFER: 6.0,
  TANKER: 5.8,
  LOWBOY: 5.5,
};

export type EnforcementLevel = "high" | "medium" | "low";

/** Weigh-station / DOT enforcement density per state for /stops cross-referencing. */
export const ENFORCEMENT_DENSITY: Record<string, EnforcementLevel> = {
  CA: "high", TX: "high", OH: "high", FL: "high", NY: "high", NM: "high",
  PA: "medium", TN: "medium", KY: "medium", IN: "medium", VA: "medium", IL: "medium",
};

export function enforcementFor(stateCode: string | undefined): EnforcementLevel {
  if (!stateCode) return "low";
  return ENFORCEMENT_DENSITY[stateCode.toUpperCase()] ?? "low";
}
