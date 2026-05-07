// Master routing orchestrator. OSRM → Valhalla → OpenRouteService fallback chain.
// On all-three failure, throws RoutingError — handlers translate that to a clean user-facing error.

import { getRoute as osrmRoute } from "@/lib/routing/osrm";
import { getRoute as valhallaRoute } from "@/lib/routing/valhalla";
import { getRoute as openrouteRoute } from "@/lib/routing/openroute";
import { RoutingError, type LatLng, type RouteResult, type RoutingProvider } from "@/lib/types";

export interface RouteRequestOptions {
  /** Ask OSRM (and only OSRM, the only chain member that supports it) to avoid toll roads. */
  excludeTolls?: boolean;
}

interface ProviderAttempt {
  provider: RoutingProvider;
  fn: (o: LatLng, d: LatLng, opts: RouteRequestOptions) => Promise<RouteResult>;
}

const CHAIN: ProviderAttempt[] = [
  { provider: "osrm", fn: (o, d, opts) => osrmRoute(o, d, { excludeTolls: opts.excludeTolls }) },
  { provider: "valhalla", fn: (o, d) => valhallaRoute(o, d) },
  { provider: "openroute", fn: (o, d) => openrouteRoute(o, d) },
];

export interface OrchestratorResult extends RouteResult {
  providersTried: RoutingProvider[];
}

export async function getRoute(
  origin: LatLng,
  destination: LatLng,
  opts: RouteRequestOptions = {},
): Promise<OrchestratorResult> {
  const tried: RoutingProvider[] = [];
  const errors: string[] = [];
  for (const attempt of CHAIN) {
    tried.push(attempt.provider);
    try {
      const r = await attempt.fn(origin, destination, opts);
      return { ...r, providersTried: tried };
    } catch (err) {
      errors.push(err instanceof RoutingError ? err.message : String(err));
      continue;
    }
  }
  throw new RoutingError("openroute", `all routing providers failed: ${errors.join(" | ")}`);
}
