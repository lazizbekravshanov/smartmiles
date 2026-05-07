// Indiana Toll Road (ITR Concession Co.) scraper.
//   Rate page:    https://www.indianatollroad.org/toll-rate-information/
//   Calculator:   https://www.indianatollroad.org/toll-calculator/
//
// 157-mile road I-80/I-90 from Chicago Skyway to OH line. Class 5 = 5-axle semi.
// Annual rate increase typically July 1.

import { defineScraper, notImplemented } from "./_base";
import type { ScrapedRate } from "@/lib/toll/types";

export const scrape = defineScraper({
  authorityId: "in-toll-road",
  sourceUrl: "https://www.indianatollroad.org/toll-rate-information/",
  parse: async (): Promise<ScrapedRate[]> => {
    notImplemented(
      "Parse the per-class rate matrix between Exits 0 (IL line) and 157 (OH line). 24 numbered " +
        "interchanges → ~276 entry-exit pairs.",
    );
  },
});
