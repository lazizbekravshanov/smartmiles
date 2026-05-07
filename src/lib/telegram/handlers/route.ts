// /route — point-to-point truck routing. Geocode → routing fallback chain → fuel cost → toll cost
// (DB-first via TollEstimator) → toll-free alternate via OSRM exclude=toll → reply.

import { prisma } from "@/lib/db";
import { geocode } from "@/lib/routing/nominatim";
import { getRoute } from "@/lib/routing/router";
import { estimateToll } from "@/lib/toll/estimator";
import { estimateFuel } from "@/lib/utils/fuel";
import { formatETA, formatGallons, formatMiles, formatPricePerGallon, formatUSD } from "@/lib/utils/format";
import { truncateAtWordBoundary } from "@/lib/utils/telegram";
import { RoutingError } from "@/lib/types";
import type { SessionContext } from "@/lib/telegram/middleware/session";

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

const NJ_FLAG = "⚠️ _NJ Turnpike has the highest 5-axle per-mile rate in the US — check /toll for the exact peak/off-peak split._";

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

  // Primary route + toll-free alt in parallel. Either may fail independently — alt is decoration.
  const o = { lat: originGeo.lat, lng: originGeo.lng };
  const d = { lat: destGeo.lat, lng: destGeo.lng };

  let route;
  try {
    route = await getRoute(o, d);
  } catch (err) {
    if (err instanceof RoutingError) {
      await ctx.reply("All routing providers are unavailable right now. Try again in a few minutes.");
      return;
    }
    throw err;
  }
  const altRoutePromise = getRoute(o, d, { excludeTolls: true }).catch(() => null);

  const corridorStates = [originGeo.region, destGeo.region].filter((s): s is string => !!s);
  const fuel = estimateFuel({
    miles: route.miles,
    truckClass: ctx.user.truckClass,
    corridorStates,
  });

  const tolls = await estimateToll({
    routeBbox: route.bbox,
    routePolyline: route.geometry,
    states: corridorStates,
    truckClass: ctx.user.truckClass,
    paymentMethod: "ezpass",
    prepassEnrolled: false,
  });

  const altRoute = await altRoutePromise;
  const altFuel = altRoute
    ? estimateFuel({ miles: altRoute.miles, truckClass: ctx.user.truckClass, corridorStates })
    : null;

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
        tollCost: tolls.totalCents > 0 ? tolls.totalCents / 100 : undefined,
        apiUsed: route.provider,
      },
    })
    .catch(() => undefined);

  const lines: string[] = [];
  lines.push(`🛣 *${parsed.origin} → ${parsed.destination}*`);
  lines.push("");
  lines.push(`📐 Distance: ${formatMiles(route.miles)}  |  ⏱ ETA: ${formatETA(route.durationMinutes)}`);
  lines.push("");
  lines.push(`💰 *Full Trip Cost:*`);
  lines.push(`⛽ Fuel:   ~${formatUSD(fuel.totalUsd)}  (${formatGallons(fuel.gallons)} @ ${formatPricePerGallon(fuel.pricePerGallon)} avg)`);

  if (tolls.totalCents === 0 && tolls.breakdown.length === 0) {
    lines.push(`🛣 Tolls:  $0  (no tolls on route)`);
  } else {
    const conf = tolls.confidence === "high" ? "" : ` _(${tolls.confidence}-conf)_`;
    lines.push(`🛣 Tolls:  ${tolls.totalFormatted}  (E-ZPass, ${ctx.user.truckClass.toLowerCase()})${conf}`);
    for (const hit of tolls.breakdown.slice(0, 5)) {
      const flag = hit.confidence === "estimated" ? " _(est)_" : "";
      lines.push(`   • ${hit.authorityName}: ${formatUSD(hit.rateCents / 100)}${flag}`);
    }
    if (tolls.unmatchedTollRoads.length > 0) {
      lines.push(`   • +${tolls.unmatchedTollRoads.length} other toll segment${tolls.unmatchedTollRoads.length === 1 ? "" : "s"} (no rate data)`);
    }
  }

  const tollDollars = tolls.totalCents / 100;
  const total = fuel.totalUsd + tollDollars;
  lines.push(`💵 Total:  ~${formatUSD(total)}`);

  if (altRoute && altFuel && tolls.totalCents > 0) {
    const altDeltaMiles = altRoute.miles - route.miles;
    const altDeltaMinutes = altRoute.durationMinutes - route.durationMinutes;
    const altDeltaFuel = altFuel.totalUsd - fuel.totalUsd;
    const tollFreeNet = tollDollars - altDeltaFuel;
    lines.push("");
    lines.push(`🔄 *Toll-free alt:*`);
    lines.push(`+${formatMiles(Math.max(0, altDeltaMiles))}  |  +${formatETA(Math.max(0, altDeltaMinutes))}  |  $0 tolls`);
    lines.push(`Extra fuel: +${formatUSD(Math.max(0, altDeltaFuel))}  |  Net savings: ${formatUSD(tollFreeNet)}`);
    if (tollFreeNet > 5) {
      lines.push(`→ Toll-free saves you ~${formatUSD(tollFreeNet)} on this run.`);
    } else if (tollFreeNet < -5) {
      lines.push(`→ Toll route is cheaper by ~${formatUSD(-tollFreeNet)} after extra fuel.`);
    }
  }

  if (tolls.prepassBypassCount > 0) {
    lines.push("");
    lines.push(`⚡ PrePass: ${tolls.prepassBypassCount} weigh-station bypass${tolls.prepassBypassCount === 1 ? "" : "es"} possible on this route`);
  }

  if (corridorStates.includes("NJ") && tolls.totalCents > 0) {
    lines.push("");
    lines.push(NJ_FLAG);
  }

  if (tolls.breakdown.length > 0) {
    const sources = Array.from(
      new Set(tolls.breakdown.map((b) => b.sourceUrl).filter((u) => u.length > 0)),
    ).slice(0, 3);
    if (sources.length > 0) {
      lines.push("");
      lines.push(`Rates: ${sources.map((u) => u.replace(/^https?:\/\/(www\.)?/, "")).join(" · ")}`);
    }
  }

  lines.push("");
  lines.push(`API: ${route.provider} · /toll for exact lookups · /fuel for cheapest stops`);

  const reply = truncateAtWordBoundary(lines.join("\n"));
  await ctx.reply(reply, { parse_mode: "Markdown" });
}
