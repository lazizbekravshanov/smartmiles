// /help — full command reference, mirror the /start aesthetic.

import type { SessionContext } from "@/lib/telegram/middleware/session";

const HELP_MESSAGE = `🛣 *SmartMiles commands*

🚛 */route* \`<from>\` to \`<to>\`
   Distance · ETA · fuel · tolls · toll-free alt
   _e.g._ /route Chicago IL to Columbus OH

💰 */toll* \`<authority>\` \`<entry>\` \`<exit>\`
   E-ZPass / cash / Toll-By-Plate breakdown
   _e.g._ /toll PA Turnpike Pittsburgh Philadelphia

⛽ */fuel* \`<from>\` to \`<to>\`
   Truck stops along corridor · cheapest-state hint

⚖️ */stops* \`<from>\` to \`<to>\`
   Weigh stations · rest areas · enforcement flag`;

export async function handleHelp(ctx: SessionContext): Promise<void> {
  await ctx.reply(HELP_MESSAGE, { parse_mode: "Markdown" });
}
