import { createClient } from 'redis';
import { config } from '../config';

/** Every key this app writes starts with this, so delByPrefix never touches another app's keys. */
const PREFIX = 'auction:';

export type Cache = ReturnType<typeof createCache>;

/**
 * faq-cache-1: a fail-open Redis cache (docs/faq-cache.md). Values are JSON. When Redis is down or slow every call
 * logs once and acts as a miss: get -> null, set/del/delByPrefix -> no-op. Callers always keep a Postgres path.
 */
export function createCache(url: string) {
  let client: ReturnType<typeof createClient> | undefined;
  let warned = false;

  function warn(err: unknown) {
    if (warned) return;
    warned = true;
    console.error('[cache] Redis unavailable, serving without cache:', err instanceof Error ? err.message : err);
  }

  function redis() {
    if (!client) {
      client = createClient({
        url,
        // Fail fast while disconnected instead of queueing commands until Redis comes back
        disableOfflineQueue: true,
        socket: { connectTimeout: 500, reconnectStrategy: (retries) => Math.min(retries * 200, 5000) },
      });
      client.on('error', warn);
      client.on('ready', () => (warned = false));
      client.connect().catch(warn);
      // An idle cache connection must not keep tests or scripts alive
      client.unref();
    }
    return client;
  }

  /** Runs one command; any error (down, timeout, bad reply) becomes the fallback. */
  async function attempt<T>(fallback: T, run: (c: ReturnType<typeof createClient>) => Promise<T>): Promise<T> {
    const c = redis();
    if (!c.isReady) return fallback;
    try {
      return await run(c);
    } catch (err) {
      warn(err);
      return fallback;
    }
  }

  return {
    async get<T>(key: string): Promise<T | null> {
      const raw = await attempt<string | null>(null, (c) => c.get(PREFIX + key));
      return raw === null ? null : (JSON.parse(raw) as T);
    },
    /** ttlSeconds > 0 is required: nothing in this cache lives forever. */
    async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
      await attempt(null, (c) => c.set(PREFIX + key, JSON.stringify(value), { EX: ttlSeconds }));
    },
    async del(...keys: string[]): Promise<void> {
      if (keys.length) await attempt(0, (c) => c.del(keys.map((k) => PREFIX + k)));
    },
    async delByPrefix(prefix: string): Promise<void> {
      await attempt(null, async (c) => {
        const keys: string[] = [];
        for await (const key of c.scanIterator({ MATCH: `${PREFIX}${prefix}*`, COUNT: 500 })) keys.push(key);
        if (keys.length) await c.del(keys);
        return null;
      });
    },
    /** True once connected; tests use it to wait for Redis. */
    get ready() {
      return redis().isReady;
    },
    async close(): Promise<void> {
      if (client?.isOpen) await client.quit().catch(warn);
      client = undefined;
    },
  };
}

export const cache = createCache(config.redisUrl);
