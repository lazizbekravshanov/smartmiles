// OpenRouteService client. Uses driving-hgv (truck) profile with 5s timeout. Free tier: 2k directions/day.

import { z } from "zod";
import { env } from "@/lib/env";
import { fetchWithTimeout } from "@/lib/routing/http";
import { RoutingError, type LatLng, type RouteResult } from "@/lib/types";

const OrsResponse = z.object({
  features: z.array(
    z.object({
      bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]),
      properties: z.object({
        summary: z.object({
          distance: z.number(), // meters
          duration: z.number(), // seconds
        }),
      }),
      geometry: z.object({
        coordinates: z.array(z.tuple([z.number(), z.number()])),
      }),
    }),
  ),
});

const METERS_PER_MILE = 1609.344;

export async function getRoute(origin: LatLng, destination: LatLng): Promise<RouteResult> {
  const apiKey = env().OPENROUTE_API_KEY;
  if (!apiKey) throw new RoutingError("openroute", "OPENROUTE_API_KEY not configured");
  const body = {
    coordinates: [
      [origin.lng, origin.lat],
      [destination.lng, destination.lat],
    ],
    units: "mi",
  };
  let res: Response;
  try {
    res = await fetchWithTimeout(`${env().OPENROUTE_BASE_URL}/v2/directions/driving-hgv/geojson`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, application/geo+json",
        Authorization: apiKey,
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new RoutingError("openroute", "network/timeout", err);
  }
  if (!res.ok) throw new RoutingError("openroute", `HTTP ${res.status}`);
  const json: unknown = await res.json();
  const parsed = OrsResponse.safeParse(json);
  if (!parsed.success) throw new RoutingError("openroute", "schema mismatch", parsed.error);
  const f = parsed.data.features[0];
  if (!f) throw new RoutingError("openroute", "empty features array");
  return {
    miles: f.properties.summary.distance / METERS_PER_MILE,
    durationMinutes: f.properties.summary.duration / 60,
    geometry: f.geometry.coordinates,
    bbox: f.bbox,
    provider: "openroute",
  };
}
