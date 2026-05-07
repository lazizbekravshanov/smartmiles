# SmartMiles — API Research

Research findings for every external API SmartMiles depends on. Use this document as the source of truth when wiring API clients in `src/lib/routing/` and `src/lib/ai/`. Verified 2026-05-07.

> **Headline:** every public OSM-hosted demo (OSRM, Nominatim, Overpass, Valhalla) is fair-use only — fine for low-volume free-tool launch, but the moment SmartMiles gets traction we MUST self-host the routing + Overpass + Nominatim stack. ORS gives us the only "official free tier" with a contractual quota (2k directions/day). The fallback chain is therefore essential, not decorative.

---

## OSRM (Open Source Routing Machine)

- **Base URL (demo):** `https://router.project-osrm.org`
- **Key endpoints:**
  - `GET /route/v1/{profile}/{coordinates}?overview=full&geometries=geojson&annotations=true` — turn-by-turn + ETA + distance
  - `GET /table/v1/{profile}/{coordinates}` — N×M distance/duration matrix
  - `GET /nearest/v1/{profile}/{coordinates}` — snap to road
  - `GET /match/v1/{profile}/{coordinates}` — map matching (GPS trace → road)
- **Rate limits (public demo):** ≤1 req/s, "reasonable, non-commercial use only", no uptime/latency/data-freshness SLA.
- **Self-hostable:** yes — Docker recipes published; truck profile requires a **custom OSRM build** with truck-specific Lua weights (HGV restrictions, max height/weight). Stock demo profile is `driving-car`, NOT truck-aware.
- **Cost:** OSS (BSD-2). Self-host on a $20–40/mo droplet handles US+Canada extract.
- **SmartMiles use case:** First choice in the routing fallback chain — fastest response on US highway corridors, used by `/route` for distance + ETA + polyline.
- **Fallback if unavailable:** Valhalla (next in chain).
- **Implementation notes:**
  - Stock demo server uses car profile → mileage will be ~accurate for highway runs, but bridge/weight restrictions are NOT respected. Flag this in `RouteQuery.apiUsed` so we can warn HazMat users to fall through to Valhalla.
  - 5s client timeout per spec.

---

## Valhalla

- **Base URL (FOSSGIS public demo):** `https://valhalla1.openstreetmap.de`
- **Key endpoints:**
  - `POST /route` — turn-by-turn with rich costing options
  - `POST /matrix` (a.k.a. `/sources_to_targets`) — distance/time matrix
  - `POST /optimized_route` — TSP-style stop reordering (server-side VRP-lite)
  - `POST /isochrone` — reachability polygons
- **Rate limits:** "Same fair-use as OSRM/Nominatim demo servers, somewhat enforced by rate limits." Project asks publishers to (a) post in GitHub Discussions, (b) send `X-Client-Id: smartmiles` header.
- **Self-hostable:** yes — Docker images published; tile-based graph means partial-region builds are practical (US+Canada extract ~30 GB tiles).
- **Cost:** OSS (MIT).
- **SmartMiles use case:** Fallback after OSRM AND the truck-aware path for HazMat / oversize loads. Truck costing accepts `height`, `width`, `length`, `weight`, `axle_load`, `axle_count`, `hazmat`, plus penalties (`low_class_penalty`, `hgv_no_access_penalty`, `use_truck_route`).
- **Fallback if unavailable:** OpenRouteService.
- **Implementation notes:**
  - Defaults already match a US semi (4.11 m H × 2.6 m W × 21.64 m L × 21.77 t, 5 axles) — no need to set every field unless user customized truck class.
  - Always send `X-Client-Id: smartmiles` and a contact email in `User-Agent`.

---

## OpenRouteService

- **Base URL:** `https://api.openrouteservice.org`
- **Key endpoints:**
  - `POST /v2/directions/{profile}/geojson` — `driving-hgv` is the truck profile (built-in HGV restrictions)
  - `POST /v2/matrix/{profile}` — up to 3,500 origin×destination cells per call
  - `POST /v2/isochrones/{profile}` — reachability (max 5 locations, 10 intervals, 120 km range)
  - `GET /geocode/search` — Pelias-based geocoding (alternative to Nominatim)
  - `POST /optimization` — VROOM-backed VRP solver (we don't need this — using our own nearest-neighbor)
- **Rate limits (free plan):** 2,000 directions/day, 500/day matrix, 500/day isochrones, 1,000/day geocoding. Per-minute limits ~40 req/min for directions. **403** on daily exceed, **429** on minutely exceed. Daily counter resets 24h after first request (sliding window).
- **Self-hostable:** yes (Docker), but graph builds are heavyweight; not recommended for SmartMiles short-term.
- **Cost:** Free tier as above; paid plans start at "collaborative plan" tier (research/NGO discounts available via HeiGIT Account).
- **SmartMiles use case:** Last routing fallback before Claude estimate. Native HGV (truck) profile — **the only free tier with built-in truck routing without a custom build**. Also our hazmat-aware option via `options.avoid_features` and `options.profile_params.restrictions.hazardous`.
- **Fallback if unavailable:** Claude-estimated response with `routeEstimateCaveat: true` flag.
- **Implementation notes:**
  - API key required (free signup at openrouteservice.org). Header: `Authorization: <key>`.
  - 5s timeout. On 429, do NOT retry within same call — surface to fallback chain.

---

## Nominatim (Geocoding)

- **Base URL:** `https://nominatim.openstreetmap.org`
- **Key endpoints:**
  - `GET /search?q={query}&format=jsonv2&limit=1&countrycodes=us,ca` — forward geocoding
  - `GET /reverse?lat={lat}&lon={lon}&format=jsonv2` — reverse geocoding
- **Rate limits:** **Hard 1 req/s** on the public instance. Required HTTP `User-Agent` or `Referer` identifying app (generic Node/axios defaults are explicitly rejected). No autocomplete, no systematic grids, no distributed scripts, no scraping `/details`. Periodic app traffic is "strongly discouraged" without per-result caching.
- **Self-hostable:** yes. Requires OSM planet file or regional extract (US+Canada extract ~15 GB; planet ~80 GB compressed). Not feasible on Vercel — would need a separate VM.
- **Cost:** OSS (GPL-2.0); demo server is free + fair-use.
- **SmartMiles use case:** Geocode user-typed origins/destinations and stops ("Chicago IL", "Indianapolis IN") → `{lat, lng}` for routing APIs. Used by every command.
- **Fallback if unavailable:** ORS Pelias geocoder (`/geocode/search`).
- **Implementation notes:**
  - Set `User-Agent: SmartMiles/0.1 (https://t.me/SmartMilesBot; contact@example.com)` — replace email pre-launch.
  - **Cache every geocode result in `ApiCache` for 30 days** — the same "Chicago IL" lookup will repeat constantly across users and is the easiest way to stay under 1 req/s.
  - Constrain `countrycodes=us,ca` to drop ambiguous matches.

---

## Overpass API (OSM POI Query)

- **Base URL:** `https://overpass-api.de/api/interpreter`
- **Key endpoints:**
  - `POST /interpreter` (or `GET ?data=`) — Overpass QL queries; we'll use POST with a body.
- **Rate limits:** ~10k req/day, ≤1 GB/day download, default 180s timeout, 12 GiB max memory per query, 262,144s max runtime. Returns **429** on rate limit, **504** on resource exhaustion. IP-based throttling; multiple concurrent slots per user.
- **Self-hostable:** yes — Docker images; a $40/mo droplet handles all POI queries at SmartMiles scale and removes the rate-limit ceiling.
- **Cost:** OSS (AGPL-3.0).
- **SmartMiles use case:**
  - `/route`: weigh stations along corridor — `node["highway"="services"]; node["amenity"="weigh_station"]; way["enforcement"="weigh_station"];` within bbox ±0.5° around route midpoint.
  - `/fuel`: truck-accessible fuel — `node["amenity"="fuel"]["hgv"="yes"]` within ±0.3° corridor bbox.
  - `/stops`: rest areas + weigh stations — `way["highway"="rest_area"]; node["highway"="services"]; node["enforcement"="weigh_station"];`.
- **Fallback if unavailable:** Static curated POI dataset (future) — for MVP, return "POI lookup temporarily unavailable" and continue the rest of the response.
- **Implementation notes:**
  - **All Overpass results MUST be cached in `ApiCache` for ≥6h** per spec.
  - Default 25s soft-timeout in our query (`[timeout:25]`) — if it doesn't finish in 25s the bot gives up and degrades.
  - Use `[out:json][timeout:25];` prefix on every query.

---

## Out-of-scope APIs (originally researched, no longer used)

Removed when scope tightened to "routes + fuel + tolls + weigh-station alerts":

- **Google OR-Tools** — was scoped for `/load` multi-stop VRP. Multi-stop dropped → not needed.
- **FMCSA SAFER (QCMobile)** — was reserved for a future `/carrier` command. Out of current scope.
- **US Census TIGER/Line Roads** — was reserved for future lane-analytics features. Out of current scope.

These can be reintroduced if/when the feature set grows. See git history for the full research notes.

---

## Toll cost (in-house, no external API)

We tried TollGuru first. Their free tier supports the consumer web calculator but **not** the API for 5-axle truck routing — that's a paid plan. To keep SmartMiles free, we compute tolls ourselves:

1. **Detection:** Overpass query for `way[highway~"motorway|trunk|primary"][toll=yes]` within the route bbox.
2. **On-route filtering:** For each toll way, sum the lengths of edges whose endpoints sit within ~0.6 mi of the route polyline. Anything below 0.5 mi total is dropped as noise.
3. **Pricing:** Static `TURNPIKE_RATES_5AXLE` table in `src/lib/routing/tolls.ts` — ~16 named US turnpikes with per-mile 5-axle E-ZPass rates. Multiplied by an axle-count factor for non-semi truck classes (STRAIGHT 0.55×, LOWBOY 1.18×, etc.).
4. **Honesty:** Reply is tagged "≈ <truckclass> E-ZPass est". Toll segments not in the rate table (e.g. local toll bridges, dynamic-priced corridors) are listed as "+ N other toll segments (cost not in table)" — no fake numbers.

**Refresh cadence:** annual. Each turnpike publishes 2026 rates on its operator site; we update the table when meaningful changes hit. Out of MVP scope: time-of-day pricing on a few corridors (NJ Turnpike rush hour), congestion-priced city zones (NYC).

**Fallback if Overpass fails:** the toll section is omitted from the reply; the route still shows miles, ETA, and fuel.

---

## Telegram Bot API

- **Base URL:** `https://api.telegram.org/bot{token}`
- **Library:** [grammy](https://grammy.dev) v1.x (TypeScript-native, webhook-friendly, smaller surface than telegraf).
- **Mode:** **Webhook only** (Vercel functions can't run long-poll). Webhook endpoint = `POST /api/telegram` on the Next.js app.
- **Rate limits:** 30 messages/sec to different users globally; 1 message/sec/chat. Bulk messages should pace.
- **Cost:** Free.
- **Limits to respect:**
  - Message body ≤ **4096 chars** (truncate at word boundary).
  - Markdown V2 has strict escaping — grammy's `parse_mode: "Markdown"` (legacy) is more forgiving for emoji/asterisk-heavy outputs.
- **SmartMiles use case:** All user I/O.
- **Fallback if unavailable:** N/A — bot is the product.

---

## Fallback Chain Summary

```
User message
   │
   ├─ /route, /fuel, /stops ────────────────────┐
   │                                            │
   │   ┌── Geocode (Nominatim) ─────────────────┤
   │   │     fallback → ORS Pelias              │
   │   │                                        │
   │   ├── Truck route                          │
   │   │     1. OSRM   (5s timeout)             │
   │   │     2. Valhalla                        │
   │   │     3. ORS /v2/directions/driving-hgv  │
   │   │     all-fail → "Routing unavailable"   │
   │   │                                        │
   │   ├── POI (Overpass) ──┐                   │
   │   │     fallback: skip POI section, keep   │
   │   │     rest of reply (degrade gracefully) │
   │   │                                        │
   │   └── Tolls (TollGuru) ──┐                 │
   │         fallback: omit toll line           │
   │                                            │
   └─ free-form text ───────────────────────────┘
        → static "use /help" hint (no LLM)
```

Every external call wraps a 5s timeout. Every fallback is logged to `RouteQuery.apiUsed` so we can monitor demo-server health and decide when to flip on self-hosted infra.
