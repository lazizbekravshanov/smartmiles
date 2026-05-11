// /start onboarding — minimalist, one emoji per line.

import type { SessionContext } from "@/lib/telegram/middleware/session";

const START_MESSAGE = `🛣 *SmartMiles*
Free routing for owner-ops + small carriers.

🚛 /route — miles · time · fuel · tolls
💰 /toll  — exact rates by turnpike
⛽ /fuel  — cheap stops on the corridor
⚖️ /stops — weigh stations + rest areas

_Try:_ /route Chicago IL to Columbus OH`;

export async function handleStart(ctx: SessionContext): Promise<void> {
  await ctx.reply(START_MESSAGE, { parse_mode: "Markdown" });
}
