// Master routing orchestrator. OSRM → Valhalla → OpenRouteService fallback chain.
// On all-three failure, throws RoutingError — handlers translate that to a clean user-facing error.

import { getRoute as osrmRoute } from "@/lib/routing/osrm";
import { getRoute as valhallaRoute } from "@/lib/routing/valhalla";
import { getRoute as openrouteRoute } from "@/lib/routing/openroute";
import { RoutingError, type LatLng, type RouteResult, type RoutingProvider } from "@/lib/types";

interface ProviderAttempt {
  provider: RoutingProvider;
  fn: (o: LatLng, d: LatLng) => Promise<RouteResult>;
}

const CHAIN: ProviderAttempt[] = [
  { provider: "osrm", fn: osrmRoute },
  { provider: "valhalla", fn: valhallaRoute },
  { provider: "openroute", fn: openrouteRoute },
];

export interface OrchestratorResult extends RouteResult {
  providersTried: RoutingProvider[];
}

export async function getRoute(origin: LatLng, destination: LatLng): Promise<OrchestratorResult> {
  const tried: RoutingProvider[] = [];
  const errors: string[] = [];
  for (const attempt of CHAIN) {
    tried.push(attempt.provider);
    try {
      const r = await attempt.fn(origin, destination);
      return { ...r, providersTried: tried };
    } catch (err) {
      errors.push(err instanceof RoutingError ? err.message : String(err));
      continue;
    }
  }
  throw new RoutingError("openroute", `all routing providers failed: ${errors.join(" | ")}`);
}
