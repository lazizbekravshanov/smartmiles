// Telegram webhook entry point. Telegram POSTs Update objects here; grammy handles dispatch.
// Timeout is 25s — under the 30s Vercel maxDuration on this route. grammy's default 10s was tripping
// on long /route requests (e.g. Baton Rouge → NJ) and Telegram retried, causing duplicate replies.

import { webhookCallback } from "grammy";
import type { NextRequest } from "next/server";
import { getBot } from "@/lib/telegram/bot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const handle = webhookCallback(getBot(), "std/http", {
  timeoutMilliseconds: 25_000,
});

export async function POST(req: NextRequest): Promise<Response> {
  return handle(req);
}
