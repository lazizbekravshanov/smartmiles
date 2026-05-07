// Redis backend stub. We never installed a real Redis client; this file exists so the cache layer
// can compile-check a swap-in path. While REDIS_URL is empty the in-memory + Prisma cache handles everything.

export interface KvBackend {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSec: number): Promise<void>;
}

class NullKv implements KvBackend {
  async get(): Promise<string | null> {
    return null;
  }
  async set(): Promise<void> {
    /* no-op */
  }
}

export function createRedis(): KvBackend {
  // Future: when REDIS_URL is set, dynamically import a redis client and return a real backend.
  return new NullKv();
}
