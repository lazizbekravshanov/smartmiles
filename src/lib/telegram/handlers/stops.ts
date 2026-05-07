// /stops — weigh stations + rest areas along the corridor with mile markers.
// Cross-references the static enforcement-density table to flag high-risk states.

import { geocode } from "@/lib/routing/nominatim";
import { getRoute } from "@/lib/routing/router";
import { queryRestAreas, queryWeighStations } from "@/lib/routing/overpass";
import { projectOntoPolyline } from "@/lib/utils/geo";
import { enforcementFor } from "@/lib/utils/constants";
import { truncateAtWordBoundary } from "@/lib/utils/telegram";
import { parseRouteArgs } from "@/lib/telegram/handlers/route";
import { RoutingError, type OverpassPOI } from "@/lib/types";
import type { SessionContext } from "@/lib/telegram/middleware/session";

interface RankedPoi {
  poi: OverpassPOI;
  mileMarker: number;
  offCorridor: number;
}

function rank(poi: OverpassPOI, polyline: Array<[number, number]>): RankedPoi {
  const proj = projectOntoPolyline({ lat: poi.lat, lng: poi.lng }, polyline);
  return { poi, mileMarker: proj.mileMarker, offCorridor: proj.offCorridor };
}

export async function handleStops(ctx: SessionContext): Promise<void> {
  const text = ctx.message?.text ?? "";
  const parsed = parseRouteArgs(text);
  if (!parsed) {
    await ctx.reply("Usage: /stops Chicago IL to Columbus OH");
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

  let restAreas: OverpassPOI[] = [];
  let weighStations: OverpassPOI[] = [];
  try {
    [restAreas, weighStations] = await Promise.all([
      queryRestAreas(route.bbox, 0.3),
      queryWeighStations(route.bbox, 0.5),
    ]);
  } catch {
    await ctx.reply("Couldn't query Overpass. Try again in a minute.");
    return;
  }

  const rankedRest = restAreas
    .map((p) => rank(p, route.geometry))
    .filter((r) => r.offCorridor < 8)
    .sort((a, b) => a.mileMarker - b.mileMarker)
    .slice(0, 6);

  const rankedWeigh = weighStations
    .map((p) => rank(p, route.geometry))
    .filter((r) => r.offCorridor < 12)
    .sort((a, b) => a.mileMarker - b.mileMarker)
    .slice(0, 6);

  const lines: string[] = [];
  lines.push(`⚖️ *Stops — ${parsed.origin} → ${parsed.destination}*`);
  lines.push("");

  lines.push("Rest Areas:");
  if (rankedRest.length === 0) {
    lines.push("  (none tagged in OSM along this corridor)");
  } else {
    for (const r of rankedRest) {
      const name = r.poi.tags["name"] ?? "Rest area";
      const dir = r.poi.tags["direction"];
      const dirSuffix = dir ? ` (${dir})` : "";
      lines.push(`  📍 ~mi ${Math.round(r.mileMarker)} — ${name}${dirSuffix}`);
    }
  }

  lines.push("");
  lines.push("Weigh Stations:");
  if (rankedWeigh.length === 0) {
    lines.push("  (none tagged in OSM along this corridor)");
  } else {
    for (const r of rankedWeigh) {
      const name = r.poi.tags["name"] ?? "Weigh station";
      lines.push(`  ⚖️ ~mi ${Math.round(r.mileMarker)} — ${name}`);
    }
  }

  const dangerStates = [originGeo.region, destGeo.region]
    .filter((s): s is string => !!s)
    .filter((s) => enforcementFor(s) === "high");
  if (dangerStates.length > 0) {
    lines.push("");
    lines.push(`⚠️ ${dangerStates.join(", ")}: HIGH enforcement density. PrePass recommended.`);
  }

  const reply = truncateAtWordBoundary(lines.join("\n"));
  await ctx.reply(reply, { parse_mode: "Markdown" });
}
