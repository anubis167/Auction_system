import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createCache } from '../../be/src/lib/cache';
import { config } from '../../be/src/config';

async function untilReady(c: ReturnType<typeof createCache>) {
  for (let i = 0; i < 50 && !c.ready; i++) await new Promise((r) => setTimeout(r, 100));
  if (!c.ready) throw new Error(`Redis not reachable at ${config.redisUrl}: run npm run db:up`);
}

// faq-cache-1: the fail-open cache against the test Redis (database 1).
describe('faq-cache-1 cache', () => {
  const cache = createCache(config.redisUrl);
  const ns = `t1-${Date.now()}:`;
  beforeAll(() => untilReady(cache));
  afterAll(async () => {
    await cache.delByPrefix(ns);
    await cache.close();
  });

  it('set then get returns the JSON value; unknown key is null', async () => {
    await cache.set(`${ns}a`, { n: 1, s: 'x', list: [1, 2] }, 60);
    expect(await cache.get(`${ns}a`)).toEqual({ n: 1, s: 'x', list: [1, 2] });
    expect(await cache.get(`${ns}missing`)).toBeNull();
  });

  it('a value expires after its TTL', async () => {
    await cache.set(`${ns}short`, 'v', 1);
    expect(await cache.get(`${ns}short`)).toBe('v');
    await new Promise((r) => setTimeout(r, 1500));
    expect(await cache.get(`${ns}short`)).toBeNull();
  });

  it('del removes keys; delByPrefix removes only that prefix', async () => {
    await cache.set(`${ns}faq:list`, 1, 60);
    await cache.set(`${ns}faq:q:1`, 2, 60);
    await cache.set(`${ns}faq:q:2`, 3, 60);
    await cache.set(`${ns}other`, 4, 60);
    await cache.del(`${ns}faq:list`);
    expect(await cache.get(`${ns}faq:list`)).toBeNull();
    await cache.delByPrefix(`${ns}faq:q:`);
    expect(await cache.get(`${ns}faq:q:1`)).toBeNull();
    expect(await cache.get(`${ns}faq:q:2`)).toBeNull();
    expect(await cache.get(`${ns}other`)).toBe(4);
  });
});

describe('faq-cache-1 cache with Redis down', () => {
  // Nothing listens on port 1
  const down = createCache('redis://127.0.0.1:1/0');
  afterAll(() => down.close());

  it('get is null and writes are no-ops, each within 1 s, without throwing', async () => {
    await new Promise((r) => setTimeout(r, 700)); // past the connect timeout, so this is a real failure, not "connecting"
    const started = Date.now();
    expect(await down.get('k')).toBeNull();
    await down.set('k', 1, 60);
    await down.del('k');
    await down.delByPrefix('k');
    expect(await down.get('k')).toBeNull();
    expect(Date.now() - started).toBeLessThan(1000);
  });
});
