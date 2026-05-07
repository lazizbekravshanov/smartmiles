// Vercel Cron endpoint — runs the master scraper, persists rates, posts an admin Telegram alert on changes.
// Schedule: 0 6 2 1 * (Jan 2 at 6am UTC) — most US toll authorities raise rates Jan 1.
// Requires Authorization header matching CRON_SECRET when called by Vercel.

import { NextResponse, type NextRequest } from "next/server";
import { runAllScrapers } from "../../../../../scripts/scrapers/run-all";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: NextRequest): Promise<Response> {
  const auth = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const report = await runAllScrapers();
  const ok = report.results.filter((r) => r.ok).length;
  const errors = report.results.filter((r) => !r.ok).map((r) => `${r.authorityId}: ${r.status}`);
  return NextResponse.json({
    ranAt: report.ranAt.toISOString(),
    authoritiesOk: ok,
    authoritiesTotal: report.results.length,
    rateChanges: report.changes.length,
    changes: report.changes,
    errors,
  });
}
