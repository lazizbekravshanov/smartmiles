// Telegram webhook entry point. Telegram POSTs Update objects here; grammy handles dispatch.

import { webhookCallback } from "grammy";
import type { NextRequest } from "next/server";
import { getBot } from "@/lib/telegram/bot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const handle = webhookCallback(getBot(), "std/http");

export async function POST(req: NextRequest): Promise<Response> {
  return handle(req);
}
