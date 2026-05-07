// OSRM routing client. Demo server uses driving-car profile (NOT truck-aware) — fine for distance/ETA on
// US highway corridors but the orchestrator must fall through to Valhalla when truck restrictions matter.

import { z } from "zod";
import { env } from "@/lib/env";
import { fetchWithTimeout } from "@/lib/routing/http";
import { RoutingError, type LatLng, type RouteResult } from "@/lib/types";

const OsrmRoute = z.object({
  distance: z.number(), // meters
  duration: z.number(), // seconds
  geometry: z.object({
    coordinates: z.array(z.tuple([z.number(), z.number()])),
  }),
});

const OsrmResponse = z.object({
  code: z.string(),
  routes: z.array(OsrmRoute),
});

const METERS_PER_MILE = 1609.344;

function bboxFor(coords: Array<[number, number]>): [number, number, number, number] {
  let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
  for (const [lng, lat] of coords) {
    if (lng < minLng) minLng = lng;
    if (lat < minLat) minLat = lat;
    if (lng > maxLng) maxLng = lng;
    if (lat > maxLat) maxLat = lat;
  }
  return [minLng, minLat, maxLng, maxLat];
}

export async function getRoute(origin: LatLng, destination: LatLng): Promise<RouteResult> {
  const coords = `${origin.lng},${origin.lat};${destination.lng},${destination.lat}`;
  const u = new URL(`${env().OSRM_BASE_URL}/route/v1/driving/${coords}`);
  u.searchParams.set("overview", "full");
  u.searchParams.set("geometries", "geojson");
  u.searchParams.set("annotations", "false");
  let res: Response;
  try {
    res = await fetchWithTimeout(u.toString(), { headers: { Accept: "application/json" } });
  } catch (err) {
    throw new RoutingError("osrm", "network/timeout", err);
  }
  if (!res.ok) throw new RoutingError("osrm", `HTTP ${res.status}`);
  const json: unknown = await res.json();
  const parsed = OsrmResponse.safeParse(json);
  if (!parsed.success) throw new RoutingError("osrm", "schema mismatch", parsed.error);
  if (parsed.data.code !== "Ok") throw new RoutingError("osrm", `code=${parsed.data.code}`);
  const r = parsed.data.routes[0];
  if (!r) throw new RoutingError("osrm", "empty routes array");
  return {
    miles: r.distance / METERS_PER_MILE,
    durationMinutes: r.duration / 60,
    geometry: r.geometry.coordinates,
    bbox: bboxFor(r.geometry.coordinates),
    provider: "osrm",
  };
}
