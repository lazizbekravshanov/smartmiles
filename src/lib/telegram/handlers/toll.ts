// /toll command — exact toll lookup against the seeded TollSegment + TollRate database.
// Accepted: "/toll PA Turnpike Pittsburgh Philadelphia", "/toll I-76 exit 57 exit 326",
//           "/toll Ohio Turnpike Indiana line Cleveland", "/toll NJ Turnpike full run".

import { prisma } from "@/lib/db";
import { formatMiles, formatUSD } from "@/lib/utils/format";
import { truncateAtWordBoundary } from "@/lib/utils/telegram";
import { vehicleClassFor } from "@/lib/toll/constants";
import type { SessionContext } from "@/lib/telegram/middleware/session";

interface ParsedTollQuery {
  authorityHint: string;
  entryHint: string;
  exitHint: string;
}

export function parseTollArgs(raw: string): ParsedTollQuery | null {
  const arg = raw.replace(/^\/toll(@\S+)?\s*/i, "").trim();
  if (!arg) return null;
  const tokens = arg.split(/\s+/);
  if (tokens.length < 3) return null;

  // Heuristic: first 1-3 tokens are the authority/highway hint; remaining tokens split into entry + exit.
  // We look for two recognizable point names by checking the back of the string for "exit N" pairs first.
  const exitPairs = arg.match(/exit\s+\S+/gi);
  if (exitPairs && exitPairs.length === 2) {
    const authorityHint = arg.slice(0, arg.toLowerCase().indexOf(exitPairs[0]!.toLowerCase())).trim();
    return {
      authorityHint,
      entryHint: exitPairs[0]!,
      exitHint: exitPairs[1]!,
    };
  }

  // Fallback: take first 1-2 tokens as authority + last 2 tokens as endpoints; middle goes to entryHint.
  // Works for "/toll PA Turnpike Pittsburgh Philadelphia" and "/toll Ohio Turnpike Indiana line Cleveland".
  if (tokens.length >= 3) {
    const last = tokens[tokens.length - 1]!;
    const firstHalfEnd = Math.min(2, tokens.length - 2);
    const authorityHint = tokens.slice(0, firstHalfEnd).join(" ");
    const entryHint = tokens.slice(firstHalfEnd, tokens.length - 1).join(" ");
    return { authorityHint, entryHint, exitHint: last };
  }
  return null;
}

interface RateRow {
  paymentMethod: string;
  rateCents: number;
  effectiveDate: Date;
  sourceUrl: string;
}

export async function handleToll(ctx: SessionContext): Promise<void> {
  const text = ctx.message?.text ?? "";
  const parsed = parseTollArgs(text);
  if (!parsed) {
    await ctx.reply("Usage: /toll PA Turnpike Pittsburgh Philadelphia\n  or:  /toll I-76 exit 57 exit 326");
    return;
  }
  await ctx.replyWithChatAction("typing").catch(() => undefined);

  // Find candidate authorities by name OR highway match.
  const hint = parsed.authorityHint.toLowerCase();
  const authorities = await prisma.tollAuthority.findMany({
    where: {
      OR: [
        { name: { contains: hint, mode: "insensitive" } },
        { id: { contains: hint.replace(/\s+/g, "-"), mode: "insensitive" } },
        { highways: { has: parsed.authorityHint.toUpperCase() } },
      ],
    },
    include: {
      segments: {
        include: {
          rates: {
            where: { vehicleClass: vehicleClassFor(ctx.user.truckClass) },
            orderBy: { effectiveDate: "desc" },
          },
        },
      },
    },
  });

  if (authorities.length === 0) {
    await ctx.reply(`No toll authority matches "${parsed.authorityHint}". Try /help for examples.`);
    return;
  }

  // Find the segment whose entry/exit names best match the user's hints.
  const entryLow = parsed.entryHint.toLowerCase();
  const exitLow = parsed.exitHint.toLowerCase();

  interface Match {
    authority: typeof authorities[number];
    segment: typeof authorities[number]["segments"][number];
    score: number;
  }
  const matches: Match[] = [];
  for (const auth of authorities) {
    for (const seg of auth.segments) {
      const e = seg.entryPointName.toLowerCase();
      const x = seg.exitPointName.toLowerCase();
      let score = 0;
      if (e.includes(entryLow) || entryLow.includes(e)) score += 2;
      if (x.includes(exitLow) || exitLow.includes(x)) score += 2;
      if (e.includes(exitLow) || x.includes(entryLow)) score += 1; // reverse match
      if (score > 0) matches.push({ authority: auth, segment: seg, score });
    }
  }

  if (matches.length === 0) {
    const auth = authorities[0]!;
    const sampleSegments = auth.segments.slice(0, 5).map((s) => `  • ${s.entryPointName} → ${s.exitPointName}`);
    await ctx.reply(
      `Found *${auth.name}* but no segment matches "${parsed.entryHint}" → "${parsed.exitHint}".\n\nKnown segments:\n${sampleSegments.join("\n") || "(no segments seeded yet for this authority)"}`,
      { parse_mode: "Markdown" },
    );
    return;
  }

  matches.sort((a, b) => b.score - a.score);
  const best = matches[0]!;
  const seg = best.segment;
  const auth = best.authority;

  const rates: RateRow[] = seg.rates.map((r) => ({
    paymentMethod: r.paymentMethod,
    rateCents: r.rateCents,
    effectiveDate: r.effectiveDate,
    sourceUrl: r.sourceUrl,
  }));

  const dist = seg.entryMileMarker !== null && seg.exitMileMarker !== null
    ? formatMiles(Math.abs((seg.exitMileMarker ?? 0) - (seg.entryMileMarker ?? 0)))
    : null;

  const ezpass = rates.find((r) => r.paymentMethod === "ezpass");
  const cash = rates.find((r) => r.paymentMethod === "cash");
  const tbp = rates.find((r) => r.paymentMethod === "platemail");
  const shortName = auth.name.replace(/Commission|Authority|Department of Transportation/g, "").trim();

  const lines: string[] = [];
  lines.push(`💰 *${shortName}*`);
  lines.push(`_${seg.entryPointName} → ${seg.exitPointName}_`);
  lines.push(`${seg.highway} · ${seg.direction === "both" ? "both ways" : seg.direction}${dist ? ` · ${dist}` : ""}`);
  lines.push("");

  if (ezpass) lines.push(`💳 E-ZPass  *${formatUSD(ezpass.rateCents / 100)}*`);
  if (tbp) lines.push(`📧 TBP       ${formatUSD(tbp.rateCents / 100)}`);
  if (cash) lines.push(`💵 Cash      ${formatUSD(cash.rateCents / 100)}`);
  if (!ezpass && !cash && !tbp) lines.push("_(no rates seeded for this segment yet)_");

  if (ezpass && (cash ?? tbp)) {
    const compare = cash ?? tbp!;
    const savings = compare.rateCents - ezpass.rateCents;
    if (savings > 0) {
      lines.push(`   _→ E-ZPass saves ${formatUSD(savings / 100)}_`);
    }
  }

  const tags: string[] = [];
  if (auth.prepassAccepted) tags.push("⚡ PrePass");
  const refRate = ezpass ?? cash ?? tbp;
  if (refRate) {
    tags.push(`📅 ${refRate.effectiveDate.toISOString().slice(0, 10)}`);
  }
  if (tags.length > 0) {
    lines.push("");
    lines.push(tags.join("  ·  "));
  }
  if (refRate) {
    lines.push(`🔗 _${refRate.sourceUrl.replace(/^https?:\/\/(www\.)?/, "")}_`);
  }

  await ctx.reply(truncateAtWordBoundary(lines.join("\n")), { parse_mode: "Markdown" });
}
