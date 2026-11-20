# faq-cache-1 - Redis service and a fail-open cache client

SRS: system - caching FAQ with redis, Req-1 (build on backend side).

## Changed files

| File | Change |
|---|---|
| docker-compose.yml | New `redis` service (redis:7-alpine, container `auction_redis`, host port 6380, `redis-cli ping` healthcheck). |
| package.json | `db:up` also starts and waits for `redis`. |
| be/package.json, package-lock.json | Added `redis` 4.7.0 (exact). |
| be/src/config.ts | `redisUrl` (env `REDIS_URL`, default `redis://127.0.0.1:6380/0`). |
| be/.env.example | `REDIS_URL`. |
| be/src/lib/cache.ts | New: `createCache(url)` and the shared `cache`: JSON `get`, `set` (TTL required), `del`, `delByPrefix`, all keys under `auction:`. Fail-open: while Redis is down or connecting, `get` returns null and writes do nothing; one error log until Redis is back. Commands are not queued while offline (`disableOfflineQueue`), connect timeout 500 ms, the connection is unref'd. |
| be/vitest.config.ts | Tests use Redis database 1. |
| playwright.config.ts | The Playwright API server uses Redis database 2 (dev uses 0). |
| e2e/unit/faq-cache-1-cache.test.ts | New: set/get, TTL expiry, del and delByPrefix scope; with Redis down every call returns within 1 s without throwing. |

## Notes

- The first calls right after the API starts can miss while the client is still connecting; that is a normal miss, not an error.
