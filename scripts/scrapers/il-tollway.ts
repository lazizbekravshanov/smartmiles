// Illinois State Toll Highway Authority scraper.
//   Rate page:    https://www.illinoistollway.com/tolling-information/toll-rates
//   Calculator:   https://www.illinoistollway.com/tolling-information/toll-calculator
//
// Multi-system: Tri-State Tollway, Reagan Memorial Tollway, Jane Addams Memorial, Veterans Memorial,
// Elgin O'Hare. Class 4 is the standard 5-axle semi class. I-PASS / E-ZPass interoperable.

import { defineScraper, notImplemented } from "./_base";
import type { ScrapedRate } from "@/lib/toll/types";

export const scrape = defineScraper({
  authorityId: "il-tollway",
  sourceUrl: "https://www.illinoistollway.com/tolling-information/toll-rates",
  parse: async (): Promise<ScrapedRate[]> => {
    notImplemented(
      "Parse the per-plaza rate schedule per Class. 5 system roads × ~10 plazas each × 4 payment methods.",
    );
  },
});
