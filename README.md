# SmartMiles

Free Telegram bot for owner-operators and small carriers in US/Canada — point-to-point truck routing with fuel + toll cost, fuel-corridor finder, and weigh-station/rest-area alerts.

> Built for the cab, not the boardroom. No signup. No filler. Miles, dollars, hours.

## Commands

| Command | What it does |
|---|---|
| `/start` | Onboarding + features list |
| `/route Chicago IL to Philadelphia PA` | Distance + ETA + fuel + toll cost (DB-first, per-state fallback) + toll-free alternate |
| `/toll PA Turnpike Pittsburgh Philadelphia` | Exact toll lookup with E-ZPass / cash / Toll-By-Plate breakdown |
| `/fuel Chicago IL to Columbus OH` | Truck-accessible fuel stops along the corridor; flags cheapest state |
| `/stops Chicago IL to Columbus OH` | Weigh stations + rest areas with mile markers |
| `/help` | Full command reference |

---

## Local development

### 1. Clone & install

```bash
git clone https://github.com/lazizbekravshanov/smartmiles.git
cd smartmiles
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Fill in the keys. Only `TELEGRAM_BOT_TOKEN` and `DATABASE_URL` are strictly required — the bot works without `OPENROUTE_API_KEY` and `TOLLGURU_API_KEY` (those features degrade cleanly when missing).

| Var | Where | Notes |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | [@BotFather](https://t.me/BotFather) | Required |
| `DATABASE_URL` | [Neon](https://neon.tech) free 0.5 GB Postgres | Required |
| `OPENROUTE_API_KEY` | [openrouteservice.org/dev](https://openrouteservice.org/dev/#/signup) | Optional — 3rd-tier routing fallback |

OSRM, Valhalla, Nominatim, and Overpass all use public OSM-hosted demo servers — no keys needed for the MVP. Toll costs are computed in-house from OpenStreetMap toll-road tags + a static turnpike rate table — no paid API.

### 3. Migrate the database

```bash
npx prisma migrate dev --name init
```

### 4. Run

```bash
npm run dev          # Next.js on :3000
ngrok http 3000      # expose locally to Telegram
npm run set-webhook https://<ngrok-id>.ngrok.io
```

Open the bot in Telegram and try `/start`.

To unregister the webhook later: `npm run set-webhook -- --delete`.

---

## Deploy to Vercel

1. Push to GitHub.
2. Import the repo on [vercel.com/new](https://vercel.com/new).
3. Set every env var from `.env.example` in **Project Settings → Environment Variables**.
4. Deploy. Vercel will give you a URL.
5. Run the webhook script once against the prod URL:

```bash
NEXT_PUBLIC_APP_URL=https://your-app.vercel.app npm run set-webhook
```

---

## Architecture

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the system design and self-hosting roadmap. See [`docs/api-research.md`](docs/api-research.md) for per-API rate limits, costs, and fallbacks.

**TL;DR:** Routing falls through `OSRM → Valhalla → OpenRouteService` — on all-three failure, the user gets a clean error. Geocoding via Nominatim with 30-day per-result caching. POI queries via Overpass (`hgv=yes` fuel stops, weigh stations, rest areas, `toll=yes` ways) with 6 h caching. Toll cost is **DB-first** (TollAuthority + TollSegment + TollRate models, government-sourced, sourceUrl + effectiveDate per row) with per-state cents-per-mile fallback. Annual Vercel cron (Jan 2 6am) re-runs scrapers. All fair-use compatible for low-volume MVP; self-hosting flagged for when traffic grows.

See [`docs/TOLL-COVERAGE.md`](docs/TOLL-COVERAGE.md) (auto-generated) for which states have exact-rate vs estimated coverage.

## License

MIT — see [`LICENSE`](LICENSE).
