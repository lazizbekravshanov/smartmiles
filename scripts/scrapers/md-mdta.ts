// Maryland Transportation Authority scraper.
//   Rate page:    https://mdta.maryland.gov/Toll_Rates
//   Calculator:   https://mdta.maryland.gov/Toll_Calculator
//
// Major facilities: Fort McHenry Tunnel (I-95), Baltimore Harbor Tunnel (I-895), Bay Bridge (US-50),
// Hatem Bridge (US-40), Inter-County Connector (MD-200), JFK Highway (I-95).

import { defineScraper, notImplemented } from "./_base";
import type { ScrapedRate } from "@/lib/toll/types";

export const scrape = defineScraper({
  authorityId: "md-mdta",
  sourceUrl: "https://mdta.maryland.gov/Toll_Rates",
  parse: async (): Promise<ScrapedRate[]> => {
    notImplemented(
      "Parse per-facility rates per axle class. Six major facilities + their direction-specific schedules.",
    );
  },
});
