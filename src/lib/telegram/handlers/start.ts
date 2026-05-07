// /start onboarding. Lean — only mentions the three commands the bot actually supports.

import type { SessionContext } from "@/lib/telegram/middleware/session";

const START_MESSAGE = `👋 Welcome to SmartMiles.

Built for owner-ops and small carriers. Free. No signup.

What I do:
/route — distance, ETA, fuel + toll cost
/fuel — cheapest truck stops along your corridor
/stops — weigh stations + rest area locations

Example:
/route Chicago IL to Columbus OH`;

export async function handleStart(ctx: SessionContext): Promise<void> {
  await ctx.reply(START_MESSAGE);
}
