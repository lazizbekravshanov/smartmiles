// Two-tier cache: in-memory Map (per-instance hot path) + Prisma ApiCache table (cross-restart durability).
// Used to keep Overpass and routing API calls under fair-use limits per spec (≥6h TTL).

import { prisma } from "@/lib/db";

interface MemEntry {
  value: unknown;
  expiresAtMs: number;
}

const mem: Map<string, MemEntry> = new Map();

export const SIX_HOURS_SEC = 6 * 60 * 60;
export const ONE_DAY_SEC = 24 * 60 * 60;
export const THIRTY_DAYS_SEC = 30 * 24 * 60 * 60;

function readMem<T>(key: string): T | undefined {
  const hit = mem.get(key);
  if (!hit) return undefined;
  if (hit.expiresAtMs < Date.now()) {
    mem.delete(key);
    return undefined;
  }
  return hit.value as T;
}

function writeMem<T>(key: string, value: T, ttlSec: number): void {
  mem.set(key, { value, expiresAtMs: Date.now() + ttlSec * 1000 });
}

async function readDb<T>(key: string): Promise<T | undefined> {
  if (!process.env.DATABASE_URL) return undefined;
  try {
    const row = await prisma.apiCache.findUnique({ where: { cacheKey: key } });
    if (!row) return undefined;
    if (row.expiresAt.getTime() < Date.now()) {
      await prisma.apiCache.delete({ where: { cacheKey: key } }).catch(() => undefined);
      return undefined;
    }
    return row.value as T;
  } catch {
    return undefined;
  }
}

async function writeDb<T>(key: string, value: T, ttlSec: number): Promise<void> {
  if (!process.env.DATABASE_URL) return;
  const expiresAt = new Date(Date.now() + ttlSec * 1000);
  try {
    await prisma.apiCache.upsert({
      where: { cacheKey: key },
      create: { cacheKey: key, value: value as object, expiresAt },
      update: { value: value as object, expiresAt },
    });
  } catch {
    /* cache writes are best-effort */
  }
}

export async function getCached<T>(key: string, ttlSec: number, fetcher: () => Promise<T>): Promise<T> {
  const fromMem = readMem<T>(key);
  if (fromMem !== undefined) return fromMem;
  const fromDb = await readDb<T>(key);
  if (fromDb !== undefined) {
    writeMem(key, fromDb, ttlSec);
    return fromDb;
  }
  const fresh = await fetcher();
  writeMem(key, fresh, ttlSec);
  await writeDb(key, fresh, ttlSec);
  return fresh;
}
