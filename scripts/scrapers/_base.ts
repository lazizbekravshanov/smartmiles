// Common scraper plumbing: fetch helpers + 24h lastScrapedAt guard + standardized return shape.
// Each per-authority scraper imports `defineScraper` and exports a `scrape()` function.

import { prisma } from "@/lib/db";
import type { ScrapedRate, ScraperResult } from "@/lib/toll/types";

export interface ScraperDefinition {
  authorityId: string;
  sourceUrl: string;
  /** Implement the actual fetch + parse logic here. Throw if unparseable. Return raw rates. */
  parse: () => Promise<ScrapedRate[]>;
}

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

export function defineScraper(def: ScraperDefinition): () => Promise<ScraperResult> {
  return async () => {
    const auth = await prisma.tollAuthority.findUnique({ where: { id: def.authorityId } });
    if (!auth) {
      return { authorityId: def.authorityId, rates: [], ok: false, status: "authority not in DB — seed first" };
    }
    if (auth.lastScrapedAt && Date.now() - auth.lastScrapedAt.getTime() < TWENTY_FOUR_HOURS_MS) {
      return {
        authorityId: def.authorityId,
        rates: [],
        ok: true,
        status: `skipped — last scraped ${auth.lastScrapedAt.toISOString()} (<24h)`,
      };
    }
    try {
      const rates = await def.parse();
      await prisma.tollAuthority.update({
        where: { id: def.authorityId },
        data: { lastScrapedAt: new Date() },
      });
      return { authorityId: def.authorityId, rates, ok: true, status: `ok — ${rates.length} rates` };
    } catch (err) {
      return {
        authorityId: def.authorityId,
        rates: [],
        ok: false,
        status: `error: ${(err as Error).message}`,
      };
    }
  };
}

/** Stub helper — call this from a parser that hasn't been implemented yet. Honest, not silent. */
export function notImplemented(detail: string): never {
  throw new Error(`parser not implemented — ${detail}`);
}
