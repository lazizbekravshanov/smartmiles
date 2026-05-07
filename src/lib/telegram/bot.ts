// grammy Bot instance + command registry. Singleton — instantiate once per Node process.
// Webhook-only (Vercel doesn't support long-poll). webhookCallback is exposed for the Next.js route.

import { Bot } from "grammy";
import { env } from "@/lib/env";
import { loggerMiddleware } from "@/lib/telegram/middleware/logger";
import { sessionMiddleware, type SessionContext } from "@/lib/telegram/middleware/session";
import { handleStart } from "@/lib/telegram/handlers/start";
import { handleHelp } from "@/lib/telegram/handlers/help";
import { handleRoute } from "@/lib/telegram/handlers/route";
import { handleFuel } from "@/lib/telegram/handlers/fuel";
import { handleStops } from "@/lib/telegram/handlers/stops";

let cached: Bot<SessionContext> | null = null;

export function getBot(): Bot<SessionContext> {
  if (cached) return cached;
  const bot = new Bot<SessionContext>(env().TELEGRAM_BOT_TOKEN);

  bot.use(loggerMiddleware);
  bot.use(sessionMiddleware);

  bot.command("start", handleStart);
  bot.command("help", handleHelp);
  bot.command("route", handleRoute);
  bot.command("fuel", handleFuel);
  bot.command("stops", handleStops);

  // Anything else → short hint, no LLM.
  bot.on("message:text", async (ctx) => {
    await ctx.reply("I only handle /route, /fuel, /stops. Try /help for examples.");
  });

  bot.catch((err) => {
    console.error("[bot] unhandled error", err);
  });

  cached = bot;
  return bot;
}

/** Register the public command list with Telegram (one-time, idempotent). */
export async function registerCommands(): Promise<void> {
  const bot = getBot();
  await bot.api.setMyCommands([
    { command: "start", description: "Welcome + features" },
    { command: "route", description: "Distance + ETA + fuel + tolls" },
    { command: "fuel", description: "Cheapest truck stops along the corridor" },
    { command: "stops", description: "Weigh stations + rest areas" },
    { command: "help", description: "Full command reference" },
  ]);
}
