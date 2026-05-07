// One-shot script: register the Telegram webhook to point at the current deploy URL.
// Usage: tsx scripts/set-webhook.ts                  -> uses NEXT_PUBLIC_APP_URL
//        tsx scripts/set-webhook.ts <publicUrl>      -> uses argv[2] (e.g. ngrok URL for local dev)
//        tsx scripts/set-webhook.ts --delete         -> removes any registered webhook

import { config } from "dotenv";
import { Bot } from "grammy";

config();

async function main(): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    throw new Error("TELEGRAM_BOT_TOKEN not set");
  }
  const bot = new Bot(token);
  const arg = process.argv[2];

  if (arg === "--delete") {
    await bot.api.deleteWebhook({ drop_pending_updates: true });
    console.log("Webhook deleted.");
    return;
  }

  const baseUrl = arg ?? process.env.NEXT_PUBLIC_APP_URL ?? "";
  if (!baseUrl) {
    throw new Error("Pass a public URL or set NEXT_PUBLIC_APP_URL in .env");
  }
  const url = `${baseUrl.replace(/\/$/, "")}/api/telegram`;
  await bot.api.setWebhook(url, { drop_pending_updates: true });
  await bot.api.setMyCommands([
    { command: "start", description: "Welcome + features" },
    { command: "route", description: "Distance + ETA + fuel + tolls" },
    { command: "fuel", description: "Cheapest truck stops along the corridor" },
    { command: "stops", description: "Weigh stations + rest areas" },
    { command: "help", description: "Full command reference" },
  ]);
  const info = await bot.api.getWebhookInfo();
  console.log(`Webhook set to: ${info.url}`);
  console.log(`Pending updates: ${info.pending_update_count}`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
