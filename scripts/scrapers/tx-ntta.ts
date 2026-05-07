// North Texas Tollway Authority scraper.
//   Rate page:    https://www.ntta.org/customer-service/tolls-and-rates
//   Calculator:   https://www.ntta.org/customer-service/tolls-and-rates/toll-calculator
//
// Per-segment pricing. Roads: DNT, PGBT, SH-121 (Sam Rayburn Tollway), SH-161 (Bush Tpk), Mountain Creek Lake Bridge.

import { defineScraper, notImplemented } from "./_base";
import type { ScrapedRate } from "@/lib/toll/types";

export const scrape = defineScraper({
  authorityId: "tx-ntta",
  sourceUrl: "https://www.ntta.org/customer-service/tolls-and-rates",
  parse: async (): Promise<ScrapedRate[]> => {
    notImplemented(
      "Parse per-segment rates per axle class. ZipCash adds ~50% surcharge over TollTag rate.",
    );
  },
});
