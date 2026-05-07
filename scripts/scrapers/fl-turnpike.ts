// Florida's Turnpike Enterprise scraper.
//   Rate page:    https://floridasturnpike.com/tolls/toll-rates/
//   2026 PDFs:    https://floridasturnpike.com/wp-content/uploads/2026/04/...  (regional splits)
//   Calculator:   https://floridasturnpike.com/TollCalc/
//
// Per-plaza pricing (not per-mile). PDFs split by region: South FL, Central FL, Sawgrass, etc.
// All-electronic since 2022 — SunPass and Toll-By-Plate only.

import { defineScraper, notImplemented } from "./_base";
import type { ScrapedRate } from "@/lib/toll/types";

export const scrape = defineScraper({
  authorityId: "fl-turnpike",
  sourceUrl: "https://floridasturnpike.com/tolls/toll-rates/",
  parse: async (): Promise<ScrapedRate[]> => {
    notImplemented(
      "Discover current PDF set under wp-content/uploads/2026/, parse each region's per-plaza axle table, " +
        "build TollSegment per (entry-plaza, exit-plaza) pair on Turnpike Mainline (SR-91).",
    );
  },
});
