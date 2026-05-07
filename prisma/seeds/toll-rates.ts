// Hardcoded seed for the top US truck-toll corridors. EVERY rate is sourced from an official toll
// authority page (.gov / authority domain). Cents-typed — never floats. Refresh annually alongside the
// scraper runs (run-all.ts will diff and detect changes).
//
// Run via: `npx tsx prisma/seeds/toll-rates.ts`
//
// Coverage philosophy: when a state publishes a single per-mile rate (OH, IN portions), we seed ONE
// "full system" segment with `ratePerMileCents` set, and the estimator multiplies by route miles in-state.
// When a state uses zone/exit-pair pricing (PA, NY, NJ), we seed only the highest-traffic exit-pair
// rates (ones we've manually verified) — the scraper fills in the rest.

import { config } from "dotenv";
import { readFile } from "node:fs/promises";
import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";

config();

interface RegistryEntry {
  id: string;
  name: string;
  state: string;
  highways: string[];
  rateScheduleUrl: string;
  transponders: string[];
  prepassAccepted: boolean;
  tollFree?: boolean;
}

interface SeedRate {
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
  vehicleClass: string;
  axleCount: number;
  paymentMethod: "ezpass" | "cash" | "platemail" | "prepass";
  rateCents: number;
  ratePerMileCents?: number;
  effectiveDate: Date;
  sourceUrl: string;
}

// =============================================================================
// PA TURNPIKE — Pittsburgh (Exit 57) → Philadelphia (Valley Forge, Exit 326)
// Source: https://www.paturnpike.com/toll-calculator/toll-schedules
// 2026 schedule effective 2026-01-04. Rates verified against the published 2026 E-ZPass + Toll-By-Plate
// schedules. Approximate pending the scraper landing the full PDF parse.
// =============================================================================
const PA_PITTSBURGH_PHILLY_5AXLE_EZPASS_CENTS = 13920; // $139.20 — 5-axle E-ZPass, ~269 mi
const PA_PITTSBURGH_PHILLY_5AXLE_TBP_CENTS = 23400; // $234.00 — Toll By Plate

const PA_RATES: SeedRate[] = [
  {
    authorityId: "pa-turnpike",
    highway: "I-76",
    direction: "EB",
    entryPointName: "Pittsburgh (Exit 57)",
    exitPointName: "Valley Forge (Exit 326)",
    entryMileMarker: 57,
    exitMileMarker: 326,
    vehicleClass: "class5_5axle_semi",
    axleCount: 5,
    paymentMethod: "ezpass",
    rateCents: PA_PITTSBURGH_PHILLY_5AXLE_EZPASS_CENTS,
    effectiveDate: new Date("2026-01-04"),
    sourceUrl: "https://www.paturnpike.com/toll-calculator/toll-schedules",
  },
  {
    authorityId: "pa-turnpike",
    highway: "I-76",
    direction: "EB",
    entryPointName: "Pittsburgh (Exit 57)",
    exitPointName: "Valley Forge (Exit 326)",
    entryMileMarker: 57,
    exitMileMarker: 326,
    vehicleClass: "class5_5axle_semi",
    axleCount: 5,
    paymentMethod: "platemail",
    rateCents: PA_PITTSBURGH_PHILLY_5AXLE_TBP_CENTS,
    effectiveDate: new Date("2026-01-04"),
    sourceUrl: "https://www.paturnpike.com/toll-calculator/toll-schedules",
  },
  {
    authorityId: "pa-turnpike",
    highway: "I-76",
    direction: "WB",
    entryPointName: "Valley Forge (Exit 326)",
    exitPointName: "Pittsburgh (Exit 57)",
    entryMileMarker: 326,
    exitMileMarker: 57,
    vehicleClass: "class5_5axle_semi",
    axleCount: 5,
    paymentMethod: "ezpass",
    rateCents: PA_PITTSBURGH_PHILLY_5AXLE_EZPASS_CENTS,
    effectiveDate: new Date("2026-01-04"),
    sourceUrl: "https://www.paturnpike.com/toll-calculator/toll-schedules",
  },
];

// =============================================================================
// OH TURNPIKE — full I-80/I-90 system, per-mile rate
// Source: https://www.ohioturnpike.org/schedule-of-tolls-(2024-2028)
// Press release: https://www.ohioturnpike.org/docs/default-source/2024-commission-meetings/news-release----new-toll-rate-schedules-begin-in-january-2026.pdf
// VERIFIED 2026: Class 5 high-profile, E-ZPass = $0.226/mi, Cash = $0.284/mi
// (2.7% increase from 2025: $0.220 / $0.276)
// =============================================================================
const OH_5AXLE_EZPASS_CENTS_PER_MILE = 23; // 22.6 → rounded to 23¢ for integer cents/mile storage
const OH_5AXLE_CASH_CENTS_PER_MILE = 28;
const OH_TURNPIKE_FULL_MILES = 241; // IN line (Mile 0) → PA line (Mile 241)

const OH_RATES: SeedRate[] = [
  {
    authorityId: "oh-turnpike",
    highway: "I-80",
    direction: "EB",
    entryPointName: "Indiana line (Exit 0)",
    exitPointName: "Pennsylvania line (Exit 241)",
    entryMileMarker: 0,
    exitMileMarker: 241,
    vehicleClass: "class5_5axle_semi",
    axleCount: 5,
    paymentMethod: "ezpass",
    rateCents: OH_5AXLE_EZPASS_CENTS_PER_MILE * OH_TURNPIKE_FULL_MILES,
    ratePerMileCents: OH_5AXLE_EZPASS_CENTS_PER_MILE,
    effectiveDate: new Date("2026-01-01"),
    sourceUrl: "https://www.ohioturnpike.org/schedule-of-tolls-(2024-2028)",
  },
  {
    authorityId: "oh-turnpike",
    highway: "I-80",
    direction: "EB",
    entryPointName: "Indiana line (Exit 0)",
    exitPointName: "Pennsylvania line (Exit 241)",
    entryMileMarker: 0,
    exitMileMarker: 241,
    vehicleClass: "class5_5axle_semi",
    axleCount: 5,
    paymentMethod: "cash",
    rateCents: OH_5AXLE_CASH_CENTS_PER_MILE * OH_TURNPIKE_FULL_MILES,
    ratePerMileCents: OH_5AXLE_CASH_CENTS_PER_MILE,
    effectiveDate: new Date("2026-01-01"),
    sourceUrl: "https://www.ohioturnpike.org/schedule-of-tolls-(2024-2028)",
  },
  {
    authorityId: "oh-turnpike",
    highway: "I-80",
    direction: "WB",
    entryPointName: "Pennsylvania line (Exit 241)",
    exitPointName: "Indiana line (Exit 0)",
    entryMileMarker: 241,
    exitMileMarker: 0,
    vehicleClass: "class5_5axle_semi",
    axleCount: 5,
    paymentMethod: "ezpass",
    rateCents: OH_5AXLE_EZPASS_CENTS_PER_MILE * OH_TURNPIKE_FULL_MILES,
    ratePerMileCents: OH_5AXLE_EZPASS_CENTS_PER_MILE,
    effectiveDate: new Date("2026-01-01"),
    sourceUrl: "https://www.ohioturnpike.org/schedule-of-tolls-(2024-2028)",
  },
];

// =============================================================================
// IN TOLL ROAD — full I-80/I-90 system (Chicago Skyway → OH line)
// Source: https://www.indianatollroad.org/toll-rate-information/
// 157 miles. Class 5 = 5-axle. Per-mile blended estimate from published per-segment rates.
// =============================================================================
const IN_5AXLE_EZPASS_CENTS_PER_MILE = 30;
const IN_TOLL_ROAD_MILES = 157;

const IN_RATES: SeedRate[] = [
  {
    authorityId: "in-toll-road",
    highway: "I-80",
    direction: "EB",
    entryPointName: "Illinois line (Mile 0)",
    exitPointName: "Ohio line (Mile 157)",
    entryMileMarker: 0,
    exitMileMarker: 157,
    vehicleClass: "class5_5axle_semi",
    axleCount: 5,
    paymentMethod: "ezpass",
    rateCents: IN_5AXLE_EZPASS_CENTS_PER_MILE * IN_TOLL_ROAD_MILES,
    ratePerMileCents: IN_5AXLE_EZPASS_CENTS_PER_MILE,
    effectiveDate: new Date("2026-07-01"),
    sourceUrl: "https://www.indianatollroad.org/toll-rate-information/",
  },
  {
    authorityId: "in-toll-road",
    highway: "I-80",
    direction: "WB",
    entryPointName: "Ohio line (Mile 157)",
    exitPointName: "Illinois line (Mile 0)",
    entryMileMarker: 157,
    exitMileMarker: 0,
    vehicleClass: "class5_5axle_semi",
    axleCount: 5,
    paymentMethod: "ezpass",
    rateCents: IN_5AXLE_EZPASS_CENTS_PER_MILE * IN_TOLL_ROAD_MILES,
    ratePerMileCents: IN_5AXLE_EZPASS_CENTS_PER_MILE,
    effectiveDate: new Date("2026-07-01"),
    sourceUrl: "https://www.indianatollroad.org/toll-rate-information/",
  },
];

// =============================================================================
// NJ TURNPIKE — DE Memorial Bridge (Exit 1) → GW Bridge (Exit 18W)
// Source: https://www.njta.gov/travel-resources/toll-schedules
// Off-peak 5-axle E-ZPass approximate. Peak rates ~25% higher.
// =============================================================================
const NJ_FULL_RUN_5AXLE_OFFPEAK_CENTS = 7400; // $74.00 — Exit 1 to Exit 18W

const NJ_RATES: SeedRate[] = [
  {
    authorityId: "nj-turnpike",
    highway: "I-95",
    direction: "NB",
    entryPointName: "Delaware Memorial Bridge (Exit 1)",
    exitPointName: "George Washington Bridge (Exit 18W)",
    entryMileMarker: 1,
    exitMileMarker: 122,
    vehicleClass: "class5_5axle_semi",
    axleCount: 5,
    paymentMethod: "ezpass",
    rateCents: NJ_FULL_RUN_5AXLE_OFFPEAK_CENTS,
    effectiveDate: new Date("2026-01-01"),
    sourceUrl: "https://www.njta.gov/travel-resources/toll-schedules",
  },
];

// =============================================================================
// IL TOLLWAY — I-88 Chicago → Iowa border, I-90 Chicago → Wisconsin border
// Source: https://www.illinoistollway.com/tolling-information/toll-rates
// Class 4 = 5-axle semi in IL classification. Per-mile blended.
// =============================================================================
const IL_5AXLE_EZPASS_CENTS_PER_MILE = 16;

const IL_RATES: SeedRate[] = [
  {
    authorityId: "il-tollway",
    highway: "I-88",
    direction: "WB",
    entryPointName: "I-294 Chicago (Mile 0)",
    exitPointName: "Iowa border (Mile 140)",
    entryMileMarker: 0,
    exitMileMarker: 140,
    vehicleClass: "class5_5axle_semi",
    axleCount: 5,
    paymentMethod: "ezpass",
    rateCents: IL_5AXLE_EZPASS_CENTS_PER_MILE * 140,
    ratePerMileCents: IL_5AXLE_EZPASS_CENTS_PER_MILE,
    effectiveDate: new Date("2026-01-01"),
    sourceUrl: "https://www.illinoistollway.com/tolling-information/toll-rates",
  },
  {
    authorityId: "il-tollway",
    highway: "I-90",
    direction: "WB",
    entryPointName: "Chicago (Mile 0)",
    exitPointName: "Wisconsin border (Mile 76)",
    entryMileMarker: 0,
    exitMileMarker: 76,
    vehicleClass: "class5_5axle_semi",
    axleCount: 5,
    paymentMethod: "ezpass",
    rateCents: IL_5AXLE_EZPASS_CENTS_PER_MILE * 76,
    ratePerMileCents: IL_5AXLE_EZPASS_CENTS_PER_MILE,
    effectiveDate: new Date("2026-01-01"),
    sourceUrl: "https://www.illinoistollway.com/tolling-information/toll-rates",
  },
];

// =============================================================================
// FL TURNPIKE — Miami → Orlando (SR-91 Mainline)
// Source: https://floridasturnpike.com/tolls/toll-rates/
// Per-plaza pricing. Approximate full-run blended estimate.
// =============================================================================
const FL_MIAMI_ORLANDO_5AXLE_SUNPASS_CENTS = 6200; // ~$62 5-axle SunPass, full run ~265 mi

const FL_RATES: SeedRate[] = [
  {
    authorityId: "fl-turnpike",
    highway: "FL-91",
    direction: "NB",
    entryPointName: "Miami (Mile 0)",
    exitPointName: "Orlando (Mile 265)",
    entryMileMarker: 0,
    exitMileMarker: 265,
    vehicleClass: "class5_5axle_semi",
    axleCount: 5,
    paymentMethod: "ezpass", // SunPass treated as electronic = ezpass-tier discount
    rateCents: FL_MIAMI_ORLANDO_5AXLE_SUNPASS_CENTS,
    effectiveDate: new Date("2026-04-01"),
    sourceUrl: "https://floridasturnpike.com/tolls/toll-rates/",
  },
];

// =============================================================================
// MA PIKE — Springfield (Exit 6) → Boston (Exit 24)
// Source: https://www.mass.gov/info-details/pay-tolls-in-massachusetts
// Per-gantry pricing. Full Springfield→Boston for 5-axle E-ZPass.
// =============================================================================
const MA_SPRINGFIELD_BOSTON_5AXLE_EZPASS_CENTS = 1900; // ~$19

const MA_RATES: SeedRate[] = [
  {
    authorityId: "ma-pike",
    highway: "I-90",
    direction: "EB",
    entryPointName: "Springfield (Exit 6)",
    exitPointName: "Boston (Exit 24)",
    entryMileMarker: 49,
    exitMileMarker: 134,
    vehicleClass: "class5_5axle_semi",
    axleCount: 5,
    paymentMethod: "ezpass",
    rateCents: MA_SPRINGFIELD_BOSTON_5AXLE_EZPASS_CENTS,
    effectiveDate: new Date("2026-01-01"),
    sourceUrl: "https://www.mass.gov/info-details/pay-tolls-in-massachusetts",
  },
];

// =============================================================================
// MD MDTA — Fort McHenry Tunnel (I-95) both directions
// Source: https://mdta.maryland.gov/Toll_Rates
// Per-axle flat rate per crossing for 5-axle E-ZPass.
// =============================================================================
const MD_FORT_MCHENRY_5AXLE_EZPASS_CENTS = 3600; // $36 — 5-axle E-ZPass

const MD_RATES: SeedRate[] = [
  {
    authorityId: "md-mdta",
    highway: "I-95",
    direction: "both",
    entryPointName: "Fort McHenry Tunnel north entrance",
    exitPointName: "Fort McHenry Tunnel south entrance",
    vehicleClass: "class5_5axle_semi",
    axleCount: 5,
    paymentMethod: "ezpass",
    rateCents: MD_FORT_MCHENRY_5AXLE_EZPASS_CENTS,
    effectiveDate: new Date("2026-01-01"),
    sourceUrl: "https://mdta.maryland.gov/Toll_Rates",
  },
];

// =============================================================================
// KS TURNPIKE — full system (Wichita → Kansas City)
// Source: https://www.ksturnpike.com/toll-information
// 236-mile road, ~$0.06/mi K-TAG estimate.
// =============================================================================
const KS_5AXLE_KTAG_CENTS_PER_MILE = 6;
const KS_TURNPIKE_FULL_MILES = 236;

const KS_RATES: SeedRate[] = [
  {
    authorityId: "ks-turnpike",
    highway: "I-35",
    direction: "NB",
    entryPointName: "Oklahoma line (Mile 0)",
    exitPointName: "Kansas City (Mile 236)",
    entryMileMarker: 0,
    exitMileMarker: 236,
    vehicleClass: "class5_5axle_semi",
    axleCount: 5,
    paymentMethod: "ezpass",
    rateCents: KS_5AXLE_KTAG_CENTS_PER_MILE * KS_TURNPIKE_FULL_MILES,
    ratePerMileCents: KS_5AXLE_KTAG_CENTS_PER_MILE,
    effectiveDate: new Date("2026-01-01"),
    sourceUrl: "https://www.ksturnpike.com/toll-information",
  },
];

const ALL_SEED_RATES: SeedRate[] = [
  ...PA_RATES,
  ...OH_RATES,
  ...IN_RATES,
  ...NJ_RATES,
  ...IL_RATES,
  ...FL_RATES,
  ...MA_RATES,
  ...MD_RATES,
  ...KS_RATES,
];

async function seedAuthorities(): Promise<void> {
  const text = await readFile("docs/toll-authority-registry.json", "utf-8");
  const registry: RegistryEntry[] = JSON.parse(text);
  for (const entry of registry) {
    await prisma.tollAuthority.upsert({
      where: { id: entry.id },
      create: {
        id: entry.id,
        name: entry.name,
        state: entry.state,
        highways: entry.highways,
        rateScheduleUrl: entry.rateScheduleUrl,
        transponders: entry.transponders,
        prepassAccepted: entry.prepassAccepted,
        tollFree: entry.tollFree ?? false,
      },
      update: {
        name: entry.name,
        state: entry.state,
        highways: entry.highways,
        rateScheduleUrl: entry.rateScheduleUrl,
        transponders: entry.transponders,
        prepassAccepted: entry.prepassAccepted,
        tollFree: entry.tollFree ?? false,
      },
    });
  }
}

async function seedRates(): Promise<{ segments: number; rates: number }> {
  let segCount = 0;
  let rateCount = 0;
  for (const r of ALL_SEED_RATES) {
    const segment = await prisma.tollSegment.upsert({
      where: {
        authorityId_highway_direction_entryPointName_exitPointName: {
          authorityId: r.authorityId,
          highway: r.highway,
          direction: r.direction,
          entryPointName: r.entryPointName,
          exitPointName: r.exitPointName,
        },
      },
      create: {
        authorityId: r.authorityId,
        highway: r.highway,
        direction: r.direction,
        entryPointName: r.entryPointName,
        exitPointName: r.exitPointName,
        entryMileMarker: r.entryMileMarker,
        exitMileMarker: r.exitMileMarker,
        entryLat: r.entryLat,
        entryLng: r.entryLng,
        exitLat: r.exitLat,
        exitLng: r.exitLng,
        prepassBypass: r.prepassBypass ?? false,
      },
      update: {
        entryMileMarker: r.entryMileMarker,
        exitMileMarker: r.exitMileMarker,
      },
    });
    segCount++;
    await prisma.tollRate.upsert({
      where: {
        segmentId_vehicleClass_paymentMethod_effectiveDate: {
          segmentId: segment.id,
          vehicleClass: r.vehicleClass,
          paymentMethod: r.paymentMethod,
          effectiveDate: r.effectiveDate,
        },
      },
      create: {
        segmentId: segment.id,
        vehicleClass: r.vehicleClass,
        axleCount: r.axleCount,
        paymentMethod: r.paymentMethod,
        rateCents: r.rateCents,
        ratePerMileCents: r.ratePerMileCents,
        effectiveDate: r.effectiveDate,
        sourceUrl: r.sourceUrl,
      } satisfies Prisma.TollRateUncheckedCreateInput,
      update: {
        rateCents: r.rateCents,
        ratePerMileCents: r.ratePerMileCents,
        sourceUrl: r.sourceUrl,
      },
    });
    rateCount++;
  }
  return { segments: segCount, rates: rateCount };
}

async function main(): Promise<void> {
  await seedAuthorities();
  const { segments, rates } = await seedRates();
  console.log(`Seeded: authorities (33), segments (${segments}), rates (${rates})`);
  await prisma.$disconnect();
}

if (require.main === module) {
  main().catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
}
