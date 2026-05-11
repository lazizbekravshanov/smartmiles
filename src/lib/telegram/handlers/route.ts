// /route — point-to-point truck routing. Geocode → routing fallback chain → fuel cost → toll cost
// (DB-first via TollEstimator) → toll-free alternate via OSRM exclude=toll → reply.

import { prisma } from "@/lib/db";
import { geocode } from "@/lib/routing/nominatim";
import { getRoute } from "@/lib/routing/router";
import { estimateToll } from "@/lib/toll/estimator";
import { estimateFuel } from "@/lib/utils/fuel";
import { formatETA, formatMiles, formatUSD } from "@/lib/utils/format";
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

const NJ_FLAG = "⚠️ _NJ has the highest 5-axle per-mile in the US — /toll NJ Turnpike for split._";

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

  const tollDollars = tolls.totalCents / 100;
  const total = fuel.totalUsd + tollDollars;

  const lines: string[] = [];
  lines.push(`🛣 *${parsed.origin} → ${parsed.destination}*`);
  lines.push(`${formatMiles(route.miles)} · ${formatETA(route.durationMinutes)}`);
  lines.push("");
  lines.push(`⛽ Fuel  ~${formatUSD(fuel.totalUsd)}`);

  if (tolls.totalCents === 0 && tolls.breakdown.length === 0) {
    lines.push(`💰 Tolls $0`);
  } else {
    const confTag = tolls.confidence === "high" ? "" : ` _(${tolls.confidence})_`;
    lines.push(`💰 Tolls ~${formatUSD(tollDollars)} _E-ZPass_${confTag}`);
    for (const hit of tolls.breakdown.slice(0, 5)) {
      const estFlag = hit.confidence === "estimated" ? " _(est)_" : "";
      lines.push(`   • ${hit.authorityName.replace(/Commission|Authority|Department of Transportation/g, "").trim()} — ${formatUSD(hit.rateCents / 100)}${estFlag}`);
    }
    if (tolls.unmatchedTollRoads.length > 0) {
      lines.push(`   • +${tolls.unmatchedTollRoads.length} other segment${tolls.unmatchedTollRoads.length === 1 ? "" : "s"}`);
    }
  }

  lines.push(`💵 *Total ~${formatUSD(total)}*`);

  if (altRoute && altFuel && tolls.totalCents > 0) {
    const dMiles = Math.max(0, altRoute.miles - route.miles);
    const dMinutes = Math.max(0, altRoute.durationMinutes - route.durationMinutes);
    const dFuel = Math.max(0, altFuel.totalUsd - fuel.totalUsd);
    const net = tollDollars - dFuel;
    lines.push("");
    lines.push(`🔄 Toll-free: +${formatMiles(dMiles)} · +${formatETA(dMinutes)} · +${formatUSD(dFuel)} fuel`);
    if (net > 5) {
      lines.push(`   _→ Saves *${formatUSD(net)}*. Worth it._`);
    } else if (net < -5) {
      lines.push(`   _→ Toll route wins by ${formatUSD(-net)}._`);
    } else {
      lines.push(`   _→ Roughly a wash._`);
    }
  }

  if (tolls.prepassBypassCount > 0) {
    lines.push("");
    lines.push(`⚡ ${tolls.prepassBypassCount} PrePass bypass${tolls.prepassBypassCount === 1 ? "" : "es"} on route`);
  }

  if (corridorStates.includes("NJ") && tolls.totalCents > 0) {
    lines.push("");
    lines.push(NJ_FLAG);
  }

  if (route.provider !== "osrm") {
    lines.push("");
    lines.push(`_via ${route.provider}_`);
  }

  const reply = truncateAtWordBoundary(lines.join("\n"));
  await ctx.reply(reply, { parse_mode: "Markdown" });
}
