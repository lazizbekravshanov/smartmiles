// /fuel — fuel-corridor finder. Geocode endpoints → routing chain → Overpass for hgv-tagged fuel stops →
// project onto polyline → return top 5 ranked by mile marker. Highlights the cheapest-state to fuel in.

import { geocode } from "@/lib/routing/nominatim";
import { getRoute } from "@/lib/routing/router";
import { queryFuelStops } from "@/lib/routing/overpass";
import { projectOntoPolyline } from "@/lib/utils/geo";
import { STATE_DIESEL_AVG } from "@/lib/utils/constants";
import { formatPricePerGallon } from "@/lib/utils/format";
import { truncateAtWordBoundary } from "@/lib/utils/telegram";
import { parseRouteArgs } from "@/lib/telegram/handlers/route";
import { RoutingError, type FuelStop } from "@/lib/types";
import type { SessionContext } from "@/lib/telegram/middleware/session";

interface RankedStop {
  stop: FuelStop;
  mileMarker: number;
  offCorridor: number;
}

export async function handleFuel(ctx: SessionContext): Promise<void> {
  const text = ctx.message?.text ?? "";
  const parsed = parseRouteArgs(text);
  if (!parsed) {
    await ctx.reply("Usage: /fuel Chicago IL to Columbus OH");
    return;
  }
  await ctx.replyWithChatAction("typing").catch(() => undefined);

  let originGeo, destGeo;
  try {
    [originGeo, destGeo] = await Promise.all([geocode(parsed.origin), geocode(parsed.destination)]);
  } catch (err) {
    await ctx.reply(`Couldn't find one of those locations. ${(err as Error).message}`);
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

  let stops: FuelStop[];
  try {
    stops = await queryFuelStops(route.bbox, 0.3);
  } catch {
    await ctx.reply("Couldn't query Overpass for fuel stops. Try again in a minute.");
    return;
  }

  const ranked: RankedStop[] = stops
    .map((stop) => {
      const proj = projectOntoPolyline({ lat: stop.lat, lng: stop.lng }, route.geometry);
      return { stop, mileMarker: proj.mileMarker, offCorridor: proj.offCorridor };
    })
    .filter((r) => r.offCorridor < 10)
    .sort((a, b) => a.mileMarker - b.mileMarker)
    .slice(0, 5);

  const corridorStates = [originGeo.region, destGeo.region].filter((s): s is string => !!s);
  const corridorPrices = corridorStates
    .map((s) => STATE_DIESEL_AVG[s.toUpperCase()])
    .filter((p): p is number => typeof p === "number");
  const avgPrice =
    corridorPrices.length > 0 ? corridorPrices.reduce((a, b) => a + b, 0) / corridorPrices.length : null;

  const NUM_EMOJI = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣"];

  const lines: string[] = [];
  lines.push(`⛽ *${parsed.origin} → ${parsed.destination}*`);
  lines.push("");
  if (ranked.length === 0) {
    lines.push("_No truck-accessible stops tagged in OSM on this corridor._");
    lines.push("Pilot / Love's / Flying J are usually at major exits even when OSM doesn't tag them.");
  } else {
    ranked.forEach((r, idx) => {
      const brand = r.stop.brand ?? r.stop.name ?? "Truck stop";
      const city = r.stop.city ? ` · ${r.stop.city}` : "";
      const prefix = NUM_EMOJI[idx] ?? `${idx + 1}.`;
      lines.push(`${prefix} ${brand}${city} _(mi ${Math.round(r.mileMarker)})_`);
    });
    lines.push("");
    if (avgPrice !== null) {
      lines.push(`📊 Corridor avg: ${formatPricePerGallon(avgPrice)}`);
    }
    if (corridorStates.length > 1) {
      const cheapest = corridorStates
        .map((s) => ({ s, p: STATE_DIESEL_AVG[s.toUpperCase()] }))
        .filter((x): x is { s: string; p: number } => typeof x.p === "number")
        .sort((a, b) => a.p - b.p)[0];
      if (cheapest) lines.push(`💡 _Fuel up in ${cheapest.s} (${formatPricePerGallon(cheapest.p)}) — cheapest on this run._`);
    }
  }

  const reply = truncateAtWordBoundary(lines.join("\n"));
  await ctx.reply(reply, { parse_mode: "Markdown" });
}
