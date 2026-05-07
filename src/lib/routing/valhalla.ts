// Valhalla routing client. FOSSGIS demo at valhalla1.openstreetmap.de. Truck costing is the differentiator
// vs OSRM — supports height/weight/axle/hazmat. Always sends X-Client-Id per FOSSGIS request.

import { z } from "zod";
import { env } from "@/lib/env";
import { fetchWithTimeout } from "@/lib/routing/http";
import { RoutingError, type LatLng, type RouteResult } from "@/lib/types";

const ValhallaSummary = z.object({
  length: z.number(), // miles when units=miles
  time: z.number(), // seconds
  min_lat: z.number(),
  min_lon: z.number(),
  max_lat: z.number(),
  max_lon: z.number(),
});

const ValhallaResponse = z.object({
  trip: z.object({
    summary: ValhallaSummary,
    legs: z.array(
      z.object({
        shape: z.string(), // encoded polyline6
      }),
    ),
  }),
});

/** Decode Valhalla's polyline6 (Google polyline-style with 1e-6 precision). */
function decodePolyline6(encoded: string): Array<[number, number]> {
  const coords: Array<[number, number]> = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  while (index < encoded.length) {
    let result = 0;
    let shift = 0;
    let byte: number;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    const dlat = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
    lat += dlat;
    result = 0;
    shift = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    const dlng = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
    lng += dlng;
    coords.push([lng / 1e6, lat / 1e6]);
  }
  return coords;
}

export interface TruckCosting {
  height?: number;
  width?: number;
  length?: number;
  weight?: number;
  axle_load?: number;
  axle_count?: number;
  hazmat?: boolean;
}

export async function getRoute(
  origin: LatLng,
  destination: LatLng,
  truck?: TruckCosting,
): Promise<RouteResult> {
  const body = {
    locations: [
      { lat: origin.lat, lon: origin.lng },
      { lat: destination.lat, lon: destination.lng },
    ],
    costing: "truck",
    costing_options: { truck: truck ?? {} },
    units: "miles",
    id: "smartmiles",
  };
  let res: Response;
  try {
    res = await fetchWithTimeout(`${env().VALHALLA_BASE_URL}/route`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-Client-Id": "smartmiles",
        "User-Agent": env().NOMINATIM_USER_AGENT,
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new RoutingError("valhalla", "network/timeout", err);
  }
  if (!res.ok) throw new RoutingError("valhalla", `HTTP ${res.status}`);
  const json: unknown = await res.json();
  const parsed = ValhallaResponse.safeParse(json);
  if (!parsed.success) throw new RoutingError("valhalla", "schema mismatch", parsed.error);
  const { summary, legs } = parsed.data.trip;
  const geometry = legs.flatMap((leg) => decodePolyline6(leg.shape));
  return {
    miles: summary.length,
    durationMinutes: summary.time / 60,
    geometry,
    bbox: [summary.min_lon, summary.min_lat, summary.max_lon, summary.max_lat],
    provider: "valhalla",
  };
}
