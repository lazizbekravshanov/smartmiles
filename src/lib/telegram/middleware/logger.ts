// Per-update logger middleware. One concise log line per Telegram update so we can debug rate-limit issues.

import type { Context, MiddlewareFn } from "grammy";

export const loggerMiddleware: MiddlewareFn<Context> = async (ctx, next) => {
  const start = Date.now();
  const tgUserId = ctx.from?.id ?? "?";
  const text = ctx.message?.text ?? ctx.callbackQuery?.data ?? "<no-text>";
  const preview = text.length > 80 ? `${text.slice(0, 80)}…` : text;
  try {
    await next();
    const ms = Date.now() - start;
    console.log(`[tg ${tgUserId}] ${ms}ms ${preview}`);
  } catch (err) {
    const ms = Date.now() - start;
    console.error(`[tg ${tgUserId}] ${ms}ms ERROR ${preview}:`, err);
    throw err;
  }
};
