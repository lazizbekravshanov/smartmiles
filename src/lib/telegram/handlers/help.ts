// /help — full command reference.

import type { SessionContext } from "@/lib/telegram/middleware/session";

const HELP_MESSAGE = `*SmartMiles commands*

/route <origin> to <destination>
  Distance + ETA + fuel cost + toll cost.
  e.g. /route Chicago IL to Columbus OH

/fuel <origin> to <destination>
  Truck-accessible fuel stops along the corridor, ranked by mile marker. Highlights the cheapest state to fuel in.

/stops <origin> to <destination>
  Weigh stations + rest areas with mile markers. Flags high-enforcement-density states.

/start, /help
  This menu.`;

export async function handleHelp(ctx: SessionContext): Promise<void> {
  await ctx.reply(HELP_MESSAGE, { parse_mode: "Markdown" });
}
