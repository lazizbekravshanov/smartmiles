// MassDOT (Mass Pike I-90) scraper.
//   Rate page:    https://www.mass.gov/info-details/pay-tolls-in-massachusetts
//
// All-electronic since 2016. Per-segment between gantries; 26 gantries on I-90 between NY line and Boston.

import { defineScraper, notImplemented } from "./_base";
import type { ScrapedRate } from "@/lib/toll/types";

export const scrape = defineScraper({
  authorityId: "ma-pike",
  sourceUrl: "https://www.mass.gov/info-details/pay-tolls-in-massachusetts",
  parse: async (): Promise<ScrapedRate[]> => {
    notImplemented(
      "Parse gantry-to-gantry rates per axle class. Also include Boston tunnels (Sumner, Williams, Ted Williams) and Tobin Bridge.",
    );
  },
});
