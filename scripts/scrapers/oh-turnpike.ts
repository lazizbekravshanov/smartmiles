// Ohio Turnpike scraper. Source URL: https://www.ohioturnpike.org/schedule-of-tolls-(2024-2028)
// 2026 schedule PDF base: https://www.ohioturnpike.org/docs/default-source/schedule-of-tolls/new-toll-system/
//
// VERIFIED 2026 (from official press release, effective 2026-01-01):
//   Class 5 (5-axle high) — E-ZPass: $0.226/mi, Cash: $0.284/mi
//   2.7% increase over 2025.
//
// Per-mile structure means we don't need a full segment matrix — just the per-mile rate +
// official entry/exit interchange list. PARSER NOT YET IMPLEMENTED but the per-mile rate is in the seed.

import { defineScraper, notImplemented } from "./_base";
import type { ScrapedRate } from "@/lib/toll/types";

export const scrape = defineScraper({
  authorityId: "oh-turnpike",
  sourceUrl: "https://www.ohioturnpike.org/schedule-of-tolls-(2024-2028)",
  parse: async (): Promise<ScrapedRate[]> => {
    notImplemented(
      "Fetch the 2024-2028 Schedule of Tolls PDF and extract per-mile rates per Class. Then enumerate " +
        "interchanges (Exit numbers + mile markers) from the official Ohio Turnpike map page to populate " +
        "TollSegment rows.",
    );
  },
});
