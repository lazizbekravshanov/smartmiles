// PA Turnpike Commission scraper. Source URLs (do not change without updating the registry):
//   Schedule list:    https://www.paturnpike.com/toll-calculator/toll-schedules
//   2026 PDFs base:   https://files.paturnpike.com/production/docs/default-source/resources/tolls/toll-schedule-2026/
//   Calculator:       https://www.paturnpike.com/toll-calculator
//
// PA publishes separate 2026 E-ZPass and Toll-By-Plate PDFs. Format: matrix grid with axle classes 2-9.
// The interactive calculator may have a JSON network call — inspect /toll-calculator network traffic to
// confirm before using. PARSER NOT YET IMPLEMENTED — the seed file (prisma/seeds/toll-rates.ts) carries
// the verified Pittsburgh→Philadelphia 5-axle rate as a stop-gap until this scraper lands.

import { defineScraper, notImplemented } from "./_base";
import type { ScrapedRate } from "@/lib/toll/types";

export const scrape = defineScraper({
  authorityId: "pa-turnpike",
  sourceUrl: "https://www.paturnpike.com/toll-calculator/toll-schedules",
  parse: async (): Promise<ScrapedRate[]> => {
    notImplemented(
      "Fetch 2026 E-ZPass + Toll-By-Plate PDFs from files.paturnpike.com and parse the axle-class grid. " +
        "Use pdfjs-dist to extract text, then parse the entry/exit matrix.",
    );
  },
});
