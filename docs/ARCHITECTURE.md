# SmartMiles — Architecture

One-page system design. Read this before changing anything in `src/lib/routing/` or `src/lib/cache/`.

## Stack

- **Runtime:** Next.js 14 App Router, TypeScript (strict, no `any`), Node 20+ on Vercel.
- **Telegram framework:** [grammy](https://grammy.dev) — webhook-only (Vercel can't long-poll).
- **Database:** PostgreSQL via Prisma. Schema = `User`, `RouteQuery`, `ApiCache`.
- **Routing:** OSRM (demo) → Valhalla (FOSSGIS demo) → OpenRouteService (free tier, `driving-hgv` truck profile).
- **Tolls:** in-house — Overpass detection + static turnpike rate table (no external paid API).
- **POI data:** Nominatim (OSM-hosted) for geocoding, Overpass API for fuel stops / rest areas / weigh stations.
- **No LLM.** SmartMiles is template-driven. The bot doesn't generate freeform text.

## Request flow

```
Telegram POST → /api/telegram → grammy webhook
                                  │
                                  ├─ middleware/logger.ts        (per-update log line)
                                  ├─ middleware/session.ts       (upsert User by telegramId → ctx.user)
                                  │
                                  └─ command dispatch
                                      ├─ /start           → handlers/start.ts
                                      ├─ /help            → handlers/help.ts
                                      ├─ /route a → b     → handlers/route.ts
                                      │                       → geocode (Nominatim) ×2
                                      │                       → routing orchestrator
                                      │                       → fuel calc (state-blended diesel × mpg)
                                      │                       → TollGuru on polyline
                                      │                       → persist RouteQuery
                                      ├─ /fuel a → b      → handlers/fuel.ts
                                      │                       → routing orchestrator
                                      │                       → Overpass [hgv=yes] in corridor bbox
                                      │                       → project onto polyline → top 5 by mile marker
                                      ├─ /stops a → b     → handlers/stops.ts
                                      │                       → Overpass rest_area + weigh_station
                                      │                       → enforcement-density flag
                                      └─ free-form text   → static "use /help" hint
```

## Routing fallback chain

`src/lib/routing/router.ts` — `getRoute(origin, destination)`:

```
1. OSRM    (5s timeout, demo router.project-osrm.org)
2. Valhalla (5s timeout, FOSSGIS valhalla1.openstreetmap.de, X-Client-Id sent)
3. OpenRouteService (5s timeout, driving-hgv profile, OPENROUTE_API_KEY)
   on all-three failure → throw RoutingError; handler shows "Routing unavailable" to user.
```

Every attempt is appended to `providersTried` and the winning provider is persisted to `RouteQuery.apiUsed` so we can spot demo-server health regressions in the DB.

## Toll cost

`src/lib/routing/tolls.ts` computes tolls in-house — no paid API:

1. Overpass query for toll-tagged motorway/trunk/primary ways in the route bbox (`queryTollWays` in `overpass.ts`).
2. For each way, sum the lengths of edges whose endpoints are within ~0.6 mi of the route polyline.
3. Match the way's `name` against the `TURNPIKE_RATES_5AXLE` table (PA Turnpike, NJ Turnpike, OH Turnpike, NY Thruway, IN Toll Road, IL Tollway, MA Pike, KS/ME/FL/NH/WV/OK turnpikes — ~16 entries).
4. Multiply by `AXLE_MULTIPLIER[truckClass]` to scale 5-axle rates for STRAIGHT (0.55×), LOWBOY (1.18×), etc.
5. Toll segments not in the rate table are listed as "+ N other toll segments (cost not in table)" — never invented.

**Refresh:** turnpike rates change annually; update the table from each operator's published 2026 schedule.

**Vercel concern:** Overpass can occasionally hit 429 — the toll section is then omitted entirely (handler returns an empty `TollResult`), the rest of the reply still ships.

## Caching

`src/lib/cache/api-cache.ts` — two-tier:

| Tier | Backed by | Lifetime |
|---|---|---|
| Hot path | In-memory `Map` (per Lambda instance) | TTL of caller |
| Durable | Prisma `ApiCache` table | TTL of caller (≥6h for Overpass, 30 days for Nominatim) |

Redis is not installed — `src/lib/cache/redis.ts` is a no-op shim for a future swap-in if traffic justifies it.

## Why these choices

- **OSRM demo uses driving-car (NOT truck-aware).** Mileage and ETA on US highway corridors are accurate enough; Valhalla picks up HazMat/oversize cases. When traffic justifies it, self-host OSRM with a custom truck profile.
- **Nominatim 1 req/s is the rate-limit ceiling.** 30-day per-result cache + low MVP volume keeps us under it. ORS Pelias is the documented fallback if we ever get banned.
- **No LLM in the loop.** Original spec wired Claude in for freight commentary + NL fallback. User scoped that out — every reply is now template-driven, deterministic, and costs nothing per request.
- **Telegram legacy Markdown, not MarkdownV2.** Reply formats use `*bold*` and emoji; MarkdownV2 escaping rules would force rewriting every reply.

## Vercel deployment

- `vercel.json` — `maxDuration: 30` on `/api/telegram` (Telegram webhook can wait up to 60s, capped shorter so a stuck call doesn't block the next update).
- `scripts/set-webhook.ts` — run once after deploy: `tsx scripts/set-webhook.ts https://your-app.vercel.app`.
- Env vars to set: `TELEGRAM_BOT_TOKEN`, `DATABASE_URL`, `OPENROUTE_API_KEY` (optional), `NEXT_PUBLIC_APP_URL`.

## Future: self-hosted infra

When SmartMiles outgrows the demo servers, this is the migration order:

1. **Overpass on a $40/mo droplet** — easiest win, removes the 10k/day ceiling.
2. **Nominatim with US+Canada regional extract** — ~15 GB on disk, 4 GB RAM minimum.
3. **Valhalla self-hosted** — full truck costing control. Tile-based graph means partial-region builds are cheap.
4. **OSRM with custom truck profile** — last priority since Valhalla covers truck-specific use cases.

`docs/api-research.md` documents each provider's self-host story, requirements, and rate-limit behavior.
