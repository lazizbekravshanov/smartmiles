// /route — point-to-point truck routing. Geocode → routing fallback chain → fuel cost → toll cost (TollGuru) →
// formatted Markdown reply. No LLM. Tolls degrade silently when TOLLGURU_API_KEY is missing.

import { prisma } from "@/lib/db";
import { geocode } from "@/lib/routing/nominatim";
import { getRoute } from "@/lib/routing/router";
import { getTollCost } from "@/lib/routing/tollguru";
import { estimateFuel } from "@/lib/utils/fuel";
import {
  formatETA,
  formatGallons,
  formatMiles,
  formatPricePerGallon,
  formatUSD,
} from "@/lib/utils/format";
import { truncateAtWordBoundary } from "@/lib/utils/telegram";
import { RoutingError } from "@/lib/types";
import type { SessionContext } from "@/lib/telegram/middleware/session";

/**
 * Parse "/route Chicago IL to Columbus OH" or "/route Chicago IL Columbus OH".
 * Returns null if we can't extract two endpoints.
 */
export function parseRouteArgs(raw: string): { origin: string; destination: string } | null {
  const arg = raw.replace(/^\/(route|fuel|stops)(@\S+)?\s*/i, "").trim();
  if (!arg) return null;
  const toMatch = arg.split(/\s+to\s+/i);
  if (toMatch.length === 2 && toMatch[0]!.trim() && toMatch[1]!.trim()) {
    return { origin: toMatch[0]!.trim(), destination: toMatch[1]!.trim() };
  }
  const tokens = arg.split(/\s+/);
  if (tokens.length < 4) return null;
  const mid = Math.floor(tokens.length / 2);
  const origin = tokens.slice(0, mid).join(" ");
  const destination = tokens.slice(mid).join(" ");
  if (!origin || !destination) return null;
  return { origin, destination };
}

export async function handleRoute(ctx: SessionContext): Promise<void> {
  const text = ctx.message?.text ?? "";
  const parsed = parseRouteArgs(text);
  if (!parsed) {
    await ctx.reply("Usage: /route Chicago IL to Columbus OH");
    return;
  }
  await ctx.replyWithChatAction("typing").catch(() => undefined);

  let originGeo, destGeo;
  try {
    [originGeo, destGeo] = await Promise.all([geocode(parsed.origin), geocode(parsed.destination)]);
  } catch (err) {
    await ctx.reply(`Couldn't find one of those locations. Be more specific (city + state).\n\n${(err as Error).message}`);
    return;
  }

  let route;
  try {
    route = await getRoute(
      { lat: originGeo.lat, lng: originGeo.lng },
      { lat: destGeo.lat, lng: destGeo.lng },
    );
  } catch (err) {
    if (err instanceof RoutingError) {
      await ctx.reply("All routing providers are unavailable right now. Try again in a few minutes.");
      return;
    }
    throw err;
  }

  const corridorStates = [originGeo.region, destGeo.region].filter((s): s is string => !!s);
  const fuel = estimateFuel({
    miles: route.miles,
    truckClass: ctx.user.truckClass,
    corridorStates,
  });

  const tolls = await getTollCost(route.geometry, ctx.user.truckClass);

  await prisma.routeQuery
    .create({
      data: {
        userId: ctx.user.id,
        origin: parsed.origin,
        destination: parsed.destination,
        originLat: originGeo.lat,
        originLng: originGeo.lng,
        destLat: destGeo.lat,
        destLng: destGeo.lng,
        mileage: route.miles,
        etaMinutes: Math.round(route.durationMinutes),
        fuelEstimate: fuel.totalUsd,
        tollCost: tolls.totalUsd ?? undefined,
        apiUsed: route.provider,
      },
    })
    .catch(() => undefined);

  const lines: string[] = [];
  lines.push(`🛣 *${parsed.origin} → ${parsed.destination}*`);
  lines.push("");
  lines.push(`📏 Distance: ${formatMiles(route.miles)}`);
  lines.push(`⏱ ETA: ${formatETA(route.durationMinutes)} (no stops)`);
  lines.push(`⛽ Fuel est: ~${formatUSD(fuel.totalUsd)} (${formatGallons(fuel.gallons)} @ ${formatPricePerGallon(fuel.pricePerGallon)} avg)`);

  if (tolls.totalUsd !== null) {
    if (tolls.totalUsd > 0) {
      lines.push(`💰 Tolls: ${formatUSD(tolls.totalUsd)} (${tolls.segmentCount} segment${tolls.segmentCount === 1 ? "" : "s"})`);
    } else {
      lines.push(`💰 Tolls: $0 (no tolls on route)`);
    }
  }

  const total = fuel.totalUsd + (tolls.totalUsd ?? 0);
  if (tolls.totalUsd !== null) {
    lines.push(`🧾 Total trip cost: ~${formatUSD(total)}`);
  }
  lines.push("");
  lines.push(`API: ${route.provider} · /fuel for cheapest stops`);

  const reply = truncateAtWordBoundary(lines.join("\n"));
  await ctx.reply(reply, { parse_mode: "Markdown" });
}
