// Auto-generates docs/TOLL-COVERAGE.md from the current DB state. Run after each scraper run.
//   npx tsx scripts/generate-toll-coverage.ts

import { config } from "dotenv";
import { writeFile } from "node:fs/promises";
import { prisma } from "@/lib/db";

config();

async function main(): Promise<void> {
  const authorities = await prisma.tollAuthority.findMany({
    include: {
      segments: {
        include: { rates: true },
      },
    },
    orderBy: [{ tollFree: "asc" }, { state: "asc" }],
  });

  const exact: string[] = [];
  const seeded: string[] = [];
  const empty: string[] = [];
  const tollFree: string[] = [];

  for (const a of authorities) {
    if (a.tollFree) {
      tollFree.push(`- ${a.state} (${a.name})`);
      continue;
    }
    const segCount = a.segments.length;
    const rateCount = a.segments.reduce((acc, s) => acc + s.rates.length, 0);
    const lastScraped = a.lastScrapedAt ? a.lastScrapedAt.toISOString().slice(0, 10) : "never";
    const line = `- **${a.state}** ${a.name} — ${segCount} segments, ${rateCount} rates · last scraped: ${lastScraped} · [source](${a.rateScheduleUrl})`;
    if (a.lastScrapedAt) exact.push(line);
    else if (segCount > 0) seeded.push(line);
    else empty.push(line);
  }

  const totalAuthorities = authorities.length;
  const tollAuthorities = authorities.filter((a) => !a.tollFree).length;
  const totalSegments = authorities.reduce((acc, a) => acc + a.segments.length, 0);
  const totalRates = authorities.reduce(
    (acc, a) => acc + a.segments.reduce((s, seg) => s + seg.rates.length, 0),
    0,
  );

  const md = `# Toll coverage

Auto-generated from the live DB. Do not edit by hand — re-run \`npx tsx scripts/generate-toll-coverage.ts\` after each scraper run or seed update.

**Generated:** ${new Date().toISOString()}

## Headline numbers

- ${totalAuthorities} authorities documented (${tollAuthorities} with tolls, ${tollFree.length} flagged toll-free)
- ${totalSegments} TollSegment rows
- ${totalRates} TollRate rows
- ${exact.length} authorities with scraper-confirmed rates
- ${seeded.length} authorities with seed-only rates (waiting on scraper)
- ${empty.length} authorities documented but no rates yet

## Scraped (high confidence)

${exact.length > 0 ? exact.join("\n") : "_(none yet — scrapers are skeletons until parsers land)_"}

## Seeded only (medium confidence — verify against current .gov pages)

${seeded.length > 0 ? seeded.join("\n") : "_(none)_"}

## Documented but no rates (low confidence — falls back to per-state per-mile estimate)

${empty.length > 0 ? empty.join("\n") : "_(none)_"}

## Toll-free states (skipped by estimator)

${tollFree.length > 0 ? tollFree.join("\n") : "_(none)_"}
`;

  await writeFile("docs/TOLL-COVERAGE.md", md);
  console.log(`Wrote docs/TOLL-COVERAGE.md (${exact.length} scraped + ${seeded.length} seeded + ${empty.length} empty + ${tollFree.length} toll-free)`);
  await prisma.$disconnect();
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
