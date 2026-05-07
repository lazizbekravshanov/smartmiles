// NJ Turnpike Authority scraper. njta.com → njta.gov (302 redirect as of 2026-05).
//   Authority site:  https://www.njta.gov
//   Schedules page:  https://www.njta.gov/travel-resources/toll-schedules
//   Calculator:      https://www.njta.gov/travel-resources/toll-calculator
//
// NJ Turnpike main road has peak/off-peak pricing for the I-95 corridor. GSP is a separate schedule.
// Highest per-mile in US for 5-axle. Both schedules published as PDFs annually.

import { defineScraper, notImplemented } from "./_base";
import type { ScrapedRate } from "@/lib/toll/types";

export const scrape = defineScraper({
  authorityId: "nj-turnpike",
  sourceUrl: "https://www.njta.gov/travel-resources/toll-schedules",
  parse: async (): Promise<ScrapedRate[]> => {
    notImplemented(
      "Two PDFs to parse: NJ Turnpike (peak + off-peak by class), Garden State Parkway (per-plaza). " +
        "Both are matrix grids with class numbers 1–7+.",
    );
  },
});
