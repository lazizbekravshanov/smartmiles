// Custom Prisma-backed session middleware. Hydrates (or upserts) the User row on every update
// and attaches it to ctx as `ctx.user`. SmartMiles' "session" is just the User profile.

import type { Context, MiddlewareFn } from "grammy";
import type { User } from "@prisma/client";
import { prisma } from "@/lib/db";

export interface SessionContext extends Context {
  user: User;
}

export const sessionMiddleware: MiddlewareFn<SessionContext> = async (ctx, next) => {
  const tgUser = ctx.from;
  if (!tgUser) {
    await next();
    return;
  }
  const telegramId = String(tgUser.id);
  const user = await prisma.user.upsert({
    where: { telegramId },
    create: {
      telegramId,
      username: tgUser.username,
      firstName: tgUser.first_name,
    },
    update: {
      username: tgUser.username ?? undefined,
      firstName: tgUser.first_name ?? undefined,
    },
  });
  ctx.user = user;
  await next();
};
