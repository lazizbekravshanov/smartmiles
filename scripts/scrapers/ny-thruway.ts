// NY Thruway Authority scraper.
//   Schedule index: https://www.thruway.ny.gov/travelers/tolls/schedules/index.html
//   2026 incentive PDF: https://www.thruway.ny.gov/sites/default/files/2025-12/2026-incentive-tolls-charts.pdf
//   Special commercial: https://www.thruway.ny.gov/travelers/tolls/schedules/tollschedules/special-commercial.pdf
//   Calculator:     https://tollcalculator.thruway.ny.gov/
//
// Zone-based pricing — entry/exit interchange pair determines the toll. The calculator backend probably
// returns JSON; inspect network traffic on tollcalculator.thruway.ny.gov before wiring up.

import { defineScraper, notImplemented } from "./_base";
import type { ScrapedRate } from "@/lib/toll/types";

export const scrape = defineScraper({
  authorityId: "ny-thruway",
  sourceUrl: "https://www.thruway.ny.gov/travelers/tolls/schedules/index.html",
  parse: async (): Promise<ScrapedRate[]> => {
    notImplemented(
      "Fetch the special-commercial PDF or hit the calculator JSON backend. Enumerate every entry-exit " +
        "interchange pair (~60 interchanges → ~1800 pairs) and store as TollSegment + TollRate rows.",
    );
  },
});
