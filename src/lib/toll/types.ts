// Shared types for the toll intelligence layer. All monetary values are integer cents — no float math.

export type VehicleClass =
  | "class1_2axle_car"
  | "class2_2axle_truck"
  | "class3_3axle"
  | "class4_4axle"
  | "class5_5axle_semi"
  | "class6_6axle"
  | "class7_7plus_axle"
  | "class_oversize";

export type PaymentMethod = "ezpass" | "cash" | "platemail" | "prepass";

export interface ScrapedRate {
  /** Authority ID like "pa-turnpike". Must exist in TollAuthority table. */
  authorityId: string;
  highway: string;
  direction: string;
  entryPointName: string;
  exitPointName: string;
  entryMileMarker?: number;
  exitMileMarker?: number;
  entryLat?: number;
  entryLng?: number;
  exitLat?: number;
  exitLng?: number;
  prepassBypass?: boolean;
  vehicleClass: VehicleClass;
  axleCount: number;
  paymentMethod: PaymentMethod;
  rateCents: number;
  ratePerMileCents?: number;
  effectiveDate: Date;
  sourceUrl: string;
}

export interface ScraperResult {
  authorityId: string;
  rates: ScrapedRate[];
  /** True iff parser is implemented and produced valid output. */
  ok: boolean;
  /** Human-readable status — "ok", "todo: parse PDF", "url 404", etc. */
  status: string;
}

export interface ScraperRunReport {
  ranAt: Date;
  results: ScraperResult[];
  changes: Array<{
    authorityId: string;
    description: string;
    fromCents: number;
    toCents: number;
  }>;
}
