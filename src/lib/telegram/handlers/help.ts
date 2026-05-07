// /help — full command reference.

import type { SessionContext } from "@/lib/telegram/middleware/session";

const HELP_MESSAGE = `*SmartMiles commands*

/route <origin> to <destination>
  Distance, ETA, fuel cost, toll cost (DB-first then per-state estimate),
  and a toll-free alternate route comparison.
  e.g. /route Chicago IL to Philadelphia PA

/toll <authority> <entry> <exit>
  Exact toll lookup against the seeded rate table.
  e.g. /toll PA Turnpike Pittsburgh Philadelphia
       /toll I-76 exit 57 exit 326
       /toll Ohio Turnpike Indiana line Pennsylvania line

/fuel <origin> to <destination>
  Truck-accessible fuel stops along the corridor, ranked by mile marker.
  Highlights the cheapest state to fuel in.

/stops <origin> to <destination>
  Weigh stations + rest areas with mile markers.
  Flags high-enforcement-density states.

/start, /help
  This menu.`;

export async function handleHelp(ctx: SessionContext): Promise<void> {
  await ctx.reply(HELP_MESSAGE, { parse_mode: "Markdown" });
}
