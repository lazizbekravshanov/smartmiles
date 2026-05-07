// TollGuru client. POSTs the route polyline + truck vehicle type and returns a USD toll cost.
// Free tier ~1k req/month. If TOLLGURU_API_KEY is empty, the client returns a null cost without erroring —
// the route handler treats tolls as decoration and skips the line cleanly when unavailable.

import { z } from "zod";
import { env } from "@/lib/env";
import { fetchWithTimeout } from "@/lib/routing/http";
import { getCached, SIX_HOURS_SEC } from "@/lib/cache/api-cache";
import type { TruckClass } from "@prisma/client";
import type { TollResult } from "@/lib/types";

const TollGuruResponse = z.object({
  route: z
    .object({
      costs: z
        .object({
          tag: z.number().optional(),
          cash: z.number().optional(),
          prepaidCard: z.number().optional(),
          licensePlate: z.number().optional(),
        })
        .optional(),
      tolls: z.array(z.unknown()).optional(),
    })
    .optional(),
  message: z.string().optional(),
  status: z.string().optional(),
});

/** Map our TruckClass to TollGuru vehicleType strings. */
function vehicleTypeFor(truckClass: TruckClass): string {
  switch (truckClass) {
    case "STRAIGHT":
      return "2AxlesTruck";
    case "SEMI":
    case "FLATBED":
    case "REEFER":
      return "5AxlesTruck";
    case "TANKER":
      return "5AxlesTruck";
    case "LOWBOY":
      return "6AxlesTruck";
    default:
      return "5AxlesTruck";
  }
}

/** Encode an [lng,lat] polyline as Google's polyline algorithm (precision 5). */
function encodePolyline(coords: Array<[number, number]>): string {
  let prevLat = 0;
  let prevLng = 0;
  let result = "";
  for (const [lng, lat] of coords) {
    const iLat = Math.round(lat * 1e5);
    const iLng = Math.round(lng * 1e5);
    result += encodeSigned(iLat - prevLat);
    result += encodeSigned(iLng - prevLng);
    prevLat = iLat;
    prevLng = iLng;
  }
  return result;
}

function encodeSigned(n: number): string {
  let v = n < 0 ? ~(n << 1) : n << 1;
  let result = "";
  while (v >= 0x20) {
    result += String.fromCharCode((0x20 | (v & 0x1f)) + 63);
    v >>>= 5;
  }
  result += String.fromCharCode(v + 63);
  return result;
}

export async function getTollCost(
  geometry: Array<[number, number]>,
  truckClass: TruckClass,
): Promise<TollResult> {
  const apiKey = env().TOLLGURU_API_KEY;
  if (!apiKey || geometry.length < 2) {
    return { totalUsd: null, segmentCount: 0, source: "unavailable" };
  }
  const polyline = encodePolyline(geometry);
  const cacheKey = `tollguru:${truckClass}:${polyline.slice(0, 64)}:${geometry.length}`;
  return getCached<TollResult>(cacheKey, SIX_HOURS_SEC, async () => {
    const body = {
      source: "smartmiles",
      polyline,
      vehicleType: vehicleTypeFor(truckClass),
      vehicle: { type: vehicleTypeFor(truckClass) },
    };
    let res: Response;
    try {
      res = await fetchWithTimeout(`${env().TOLLGURU_BASE_URL}/toll/v2/complete-polyline-from-mapping-service`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "x-api-key": apiKey,
        },
        body: JSON.stringify(body),
      });
    } catch {
      return { totalUsd: null, segmentCount: 0, source: "tollguru-error" };
    }
    if (!res.ok) {
      return { totalUsd: null, segmentCount: 0, source: `tollguru-${res.status}` };
    }
    const json: unknown = await res.json();
    const parsed = TollGuruResponse.safeParse(json);
    if (!parsed.success || !parsed.data.route) {
      return { totalUsd: null, segmentCount: 0, source: "tollguru-schema" };
    }
    const route = parsed.data.route;
    const cost =
      route.costs?.tag ??
      route.costs?.cash ??
      route.costs?.licensePlate ??
      route.costs?.prepaidCard ??
      null;
    return {
      totalUsd: typeof cost === "number" ? cost : null,
      segmentCount: route.tolls?.length ?? 0,
      source: "tollguru",
    };
  });
}
