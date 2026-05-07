// Nominatim geocoding client. Public OSM-hosted instance — strict 1 req/s + User-Agent required.
// 30-day cache per result is the primary mitigation.

import { z } from "zod";
import { env } from "@/lib/env";
import { getCached, THIRTY_DAYS_SEC } from "@/lib/cache/api-cache";
import { fetchWithTimeout } from "@/lib/routing/http";
import type { GeocodeResult } from "@/lib/types";

const NominatimItem = z.object({
  lat: z.string(),
  lon: z.string(),
  display_name: z.string(),
  address: z
    .object({
      state: z.string().optional(),
      "ISO3166-2-lvl4": z.string().optional(),
      country_code: z.string().optional(),
    })
    .optional(),
});

const NominatimResponse = z.array(NominatimItem);

function regionFromAddress(item: z.infer<typeof NominatimItem>): string | undefined {
  const iso = item.address?.["ISO3166-2-lvl4"];
  if (iso && iso.includes("-")) return iso.split("-")[1]?.toUpperCase();
  return undefined;
}

export async function geocode(query: string): Promise<GeocodeResult> {
  const trimmed = query.trim();
  if (!trimmed) throw new Error("Empty geocode query");
  const cacheKey = `nominatim:${trimmed.toLowerCase()}`;
  return getCached<GeocodeResult>(cacheKey, THIRTY_DAYS_SEC, async () => {
    const u = new URL(`${env().NOMINATIM_BASE_URL}/search`);
    u.searchParams.set("q", trimmed);
    u.searchParams.set("format", "jsonv2");
    u.searchParams.set("limit", "1");
    u.searchParams.set("countrycodes", "us,ca");
    u.searchParams.set("addressdetails", "1");
    const res = await fetchWithTimeout(u.toString(), {
      headers: {
        "User-Agent": env().NOMINATIM_USER_AGENT,
        Accept: "application/json",
      },
    });
    if (!res.ok) throw new Error(`Nominatim ${res.status}`);
    const json: unknown = await res.json();
    const parsed = NominatimResponse.parse(json);
    const first = parsed[0];
    if (!first) throw new Error(`No geocode result for "${trimmed}"`);
    return {
      query: trimmed,
      lat: parseFloat(first.lat),
      lng: parseFloat(first.lon),
      displayName: first.display_name,
      region: regionFromAddress(first),
    };
  });
}
