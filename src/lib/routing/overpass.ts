// Overpass API client. Queries OSM POIs along a route corridor (weigh stations, rest areas, fuel stops).
// 25s soft timeout, 6h cache per spec, IP-based fair-use on the public instance.

import { z } from "zod";
import { env } from "@/lib/env";
import { fetchWithTimeout } from "@/lib/routing/http";
import { getCached, SIX_HOURS_SEC } from "@/lib/cache/api-cache";
import type { FuelStop, OverpassPOI, RestArea, WeighStation } from "@/lib/types";

const OverpassElement = z.object({
  type: z.enum(["node", "way", "relation"]),
  id: z.number(),
  lat: z.number().optional(),
  lon: z.number().optional(),
  center: z.object({ lat: z.number(), lon: z.number() }).optional(),
  tags: z.record(z.string()).optional(),
});

const OverpassResponse = z.object({
  elements: z.array(OverpassElement),
});

export type Bbox = [number, number, number, number]; // [minLng, minLat, maxLng, maxLat]

function pad(bbox: Bbox, deltaDeg: number): Bbox {
  const [minLng, minLat, maxLng, maxLat] = bbox;
  return [minLng - deltaDeg, minLat - deltaDeg, maxLng + deltaDeg, maxLat + deltaDeg];
}

/** Overpass takes bounding boxes as (south,west,north,east). */
function bboxClause(bbox: Bbox): string {
  const [minLng, minLat, maxLng, maxLat] = bbox;
  return `(${minLat},${minLng},${maxLat},${maxLng})`;
}

async function runOverpass(query: string): Promise<OverpassPOI[]> {
  const cacheKey = `overpass:${query}`;
  return getCached<OverpassPOI[]>(cacheKey, SIX_HOURS_SEC, async () => {
    const res = await fetchWithTimeout(env().OVERPASS_BASE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
        "User-Agent": env().NOMINATIM_USER_AGENT,
      },
      body: `data=${encodeURIComponent(query)}`,
      timeoutMs: 28_000,
    });
    if (!res.ok) throw new Error(`Overpass HTTP ${res.status}`);
    const json: unknown = await res.json();
    const parsed = OverpassResponse.parse(json);
    return parsed.elements
      .map((el) => {
        const lat = el.lat ?? el.center?.lat;
        const lng = el.lon ?? el.center?.lon;
        if (lat === undefined || lng === undefined) return null;
        return {
          id: el.id,
          type: el.type,
          lat,
          lng,
          tags: el.tags ?? {},
        } satisfies OverpassPOI;
      })
      .filter((x): x is OverpassPOI => x !== null);
  });
}

export async function queryWeighStations(routeBbox: Bbox, paddingDeg = 0.5): Promise<WeighStation[]> {
  const bb = bboxClause(pad(routeBbox, paddingDeg));
  const q = `[out:json][timeout:25];
(
  node["amenity"="weigh_station"]${bb};
  way["amenity"="weigh_station"]${bb};
  node["highway"="services"]["truck"="yes"]${bb};
);
out center tags;`;
  const pois = await runOverpass(q);
  return pois.map((p) => ({
    ...p,
    name: p.tags["name"],
    state: p.tags["addr:state"],
  }));
}

export async function queryRestAreas(routeBbox: Bbox, paddingDeg = 0.3): Promise<RestArea[]> {
  const bb = bboxClause(pad(routeBbox, paddingDeg));
  const q = `[out:json][timeout:25];
(
  node["highway"="rest_area"]${bb};
  way["highway"="rest_area"]${bb};
  node["highway"="services"]${bb};
);
out center tags;`;
  const pois = await runOverpass(q);
  return pois.map((p) => ({
    ...p,
    name: p.tags["name"],
    direction: p.tags["direction"],
  }));
}

export async function queryFuelStops(routeBbox: Bbox, paddingDeg = 0.3): Promise<FuelStop[]> {
  const bb = bboxClause(pad(routeBbox, paddingDeg));
  const q = `[out:json][timeout:25];
(
  node["amenity"="fuel"]["hgv"="yes"]${bb};
  node["amenity"="fuel"]["truck"="yes"]${bb};
);
out center tags;`;
  const pois = await runOverpass(q);
  return pois.map((p) => ({
    ...p,
    brand: p.tags["brand"] ?? p.tags["operator"],
    name: p.tags["name"],
    city: p.tags["addr:city"],
  }));
}
