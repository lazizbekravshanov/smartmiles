// Shared type definitions used across routing clients, telegram handlers, and the toll/fuel utilities.

export interface LatLng {
  lat: number;
  lng: number;
}

export type RoutingProvider = "osrm" | "valhalla" | "openroute";

export interface RouteResult {
  /** Total driving distance in miles. */
  miles: number;
  /** Driving duration in minutes (no stop time). */
  durationMinutes: number;
  /** Polyline as a list of [lng, lat] coordinates. */
  geometry: Array<[number, number]>;
  /** Bounding box [minLng, minLat, maxLng, maxLat] for downstream Overpass queries. */
  bbox: [number, number, number, number];
  /** Which provider produced the result. */
  provider: RoutingProvider;
}

export interface TollResult {
  /** USD total toll cost on the route, or null if TollGuru unavailable / no key. */
  totalUsd: number | null;
  /** Number of toll segments encountered (0 = no tolls on route). */
  segmentCount: number;
  /** Source label for the cost ("tollguru" or "unknown"). */
  source: string;
}

export class RoutingError extends Error {
  public readonly provider: RoutingProvider;
  public override readonly cause?: unknown;
  constructor(provider: RoutingProvider, message: string, cause?: unknown) {
    super(`[${provider}] ${message}`);
    this.name = "RoutingError";
    this.provider = provider;
    this.cause = cause;
  }
}

export interface GeocodeResult {
  query: string;
  lat: number;
  lng: number;
  displayName: string;
  /** Two-letter US state or Canadian province code, when extractable. */
  region?: string;
}

export interface OverpassPOI {
  id: number;
  type: "node" | "way" | "relation";
  lat: number;
  lng: number;
  tags: Record<string, string>;
  /** Approximate mile marker on the route, computed by the caller from corridor projection. */
  mileMarker?: number;
}

export interface WeighStation extends OverpassPOI {
  name?: string;
  state?: string;
}

export interface FuelStop extends OverpassPOI {
  brand?: string;
  name?: string;
  city?: string;
}

export interface RestArea extends OverpassPOI {
  name?: string;
  /** "EB", "WB", "both", or undefined when unknown. */
  direction?: string;
}

export interface FuelEstimate {
  gallons: number;
  pricePerGallon: number;
  totalUsd: number;
  /** State codes whose averages contributed to the corridor blend. */
  statesUsed: string[];
}

export interface RouteQueryInput {
  origin: string;
  destination: string;
}
