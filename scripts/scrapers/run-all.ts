// Master scraper runner. Runs each authority sequentially with 30s spacing between sites (respect server
// rate limits). Detects rate changes vs the existing DB and writes a diff log. Run via:
//   npx tsx scripts/scrapers/run-all.ts

import { config } from "dotenv";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { prisma } from "@/lib/db";
import type { ScrapedRate, ScraperResult, ScraperRunReport } from "@/lib/toll/types";

import { scrape as scrapePa } from "./pa-turnpike";
import { scrape as scrapeOh } from "./oh-turnpike";
import { scrape as scrapeNy } from "./ny-thruway";
import { scrape as scrapeNj } from "./nj-turnpike";
import { scrape as scrapeFl } from "./fl-turnpike";
import { scrape as scrapeIl } from "./il-tollway";
import { scrape as scrapeIn } from "./in-toll-road";
import { scrape as scrapeMa } from "./ma-pike";
import { scrape as scrapeMd } from "./md-mdta";
import { scrape as scrapeTx } from "./tx-ntta";

config();

const SCRAPERS: Array<{ id: string; run: () => Promise<ScraperResult> }> = [
  { id: "pa-turnpike", run: scrapePa },
  { id: "oh-turnpike", run: scrapeOh },
  { id: "ny-thruway", run: scrapeNy },
  { id: "nj-turnpike", run: scrapeNj },
  { id: "fl-turnpike", run: scrapeFl },
  { id: "il-tollway", run: scrapeIl },
  { id: "in-toll-road", run: scrapeIn },
  { id: "ma-pike", run: scrapeMa },
  { id: "md-mdta", run: scrapeMd },
  { id: "tx-ntta", run: scrapeTx },
];

const SPACING_MS = 30_000;

function sleep(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}

interface RateChange {
  authorityId: string;
  description: string;
  fromCents: number;
  toCents: number;
}

async function persistAndDiff(rates: ScrapedRate[]): Promise<RateChange[]> {
  const changes: RateChange[] = [];
  for (const rate of rates) {
    const segment = await prisma.tollSegment.upsert({
      where: {
        authorityId_highway_direction_entryPointName_exitPointName: {
          authorityId: rate.authorityId,
          highway: rate.highway,
          direction: rate.direction,
          entryPointName: rate.entryPointName,
          exitPointName: rate.exitPointName,
        },
      },
      create: {
        authorityId: rate.authorityId,
        highway: rate.highway,
        direction: rate.direction,
        entryPointName: rate.entryPointName,
        exitPointName: rate.exitPointName,
        entryMileMarker: rate.entryMileMarker,
        exitMileMarker: rate.exitMileMarker,
        entryLat: rate.entryLat,
        entryLng: rate.entryLng,
        exitLat: rate.exitLat,
        exitLng: rate.exitLng,
        prepassBypass: rate.prepassBypass ?? false,
      },
      update: {
        entryMileMarker: rate.entryMileMarker,
        exitMileMarker: rate.exitMileMarker,
        entryLat: rate.entryLat,
        entryLng: rate.entryLng,
        exitLat: rate.exitLat,
        exitLng: rate.exitLng,
      },
    });

    const existing = await prisma.tollRate.findFirst({
      where: {
        segmentId: segment.id,
        vehicleClass: rate.vehicleClass,
        paymentMethod: rate.paymentMethod,
      },
      orderBy: { effectiveDate: "desc" },
    });

    if (existing && existing.rateCents !== rate.rateCents) {
      changes.push({
        authorityId: rate.authorityId,
        description: `${rate.highway} ${rate.entryPointName}→${rate.exitPointName} ${rate.vehicleClass} ${rate.paymentMethod}`,
        fromCents: existing.rateCents,
        toCents: rate.rateCents,
      });
    }

    await prisma.tollRate.upsert({
      where: {
        segmentId_vehicleClass_paymentMethod_effectiveDate: {
          segmentId: segment.id,
          vehicleClass: rate.vehicleClass,
          paymentMethod: rate.paymentMethod,
          effectiveDate: rate.effectiveDate,
        },
      },
      create: {
        segmentId: segment.id,
        vehicleClass: rate.vehicleClass,
        axleCount: rate.axleCount,
        paymentMethod: rate.paymentMethod,
        rateCents: rate.rateCents,
        ratePerMileCents: rate.ratePerMileCents,
        effectiveDate: rate.effectiveDate,
        sourceUrl: rate.sourceUrl,
      },
      update: {
        rateCents: rate.rateCents,
        ratePerMileCents: rate.ratePerMileCents,
        sourceUrl: rate.sourceUrl,
        axleCount: rate.axleCount,
      },
    });
  }
  return changes;
}

export async function runAllScrapers(): Promise<ScraperRunReport> {
  const report: ScraperRunReport = { ranAt: new Date(), results: [], changes: [] };
  for (let i = 0; i < SCRAPERS.length; i++) {
    const s = SCRAPERS[i]!;
    const result = await s.run();
    report.results.push(result);
    if (result.ok && result.rates.length > 0) {
      const changes = await persistAndDiff(result.rates);
      report.changes.push(...changes);
    }
    if (i < SCRAPERS.length - 1) await sleep(SPACING_MS);
  }
  return report;
}

async function writeReport(report: ScraperRunReport): Promise<string> {
  const date = report.ranAt.toISOString().slice(0, 10);
  await mkdir("logs", { recursive: true });
  const path = join("logs", `toll-rate-changes-${date}.log`);
  const lines: string[] = [
    `# Toll scraper run @ ${report.ranAt.toISOString()}`,
    "",
    "## Per-authority status",
    ...report.results.map((r) => `- ${r.authorityId}: ${r.status}`),
    "",
    `## Rate changes (${report.changes.length})`,
    ...report.changes.map(
      (c) => `- ${c.authorityId}: ${c.description}: $${(c.fromCents / 100).toFixed(2)} → $${(c.toCents / 100).toFixed(2)}`,
    ),
  ];
  await writeFile(path, lines.join("\n"));
  return path;
}

async function main(): Promise<void> {
  const report = await runAllScrapers();
  const path = await writeReport(report);
  console.log(`Report: ${path}`);
  console.log(`Authorities: ${report.results.filter((r) => r.ok).length}/${report.results.length} ok`);
  console.log(`Rate changes: ${report.changes.length}`);
  if (report.changes.length > 0) {
    console.log("---CHANGES---");
    for (const c of report.changes) {
      console.log(`${c.authorityId}: ${c.description}: $${(c.fromCents / 100).toFixed(2)} → $${(c.toCents / 100).toFixed(2)}`);
    }
  }
  await prisma.$disconnect();
}

if (require.main === module) {
  main().catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
}
