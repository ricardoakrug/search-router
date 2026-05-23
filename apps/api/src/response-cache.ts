/**
 * Response cache seam. The OSS default is a no-op (no caching); the managed layer injects
 * a Redis-backed cache via `setResponseCache`. Mirrors the other seams — interface +
 * setter + default, no new dependency in core.
 */
export interface ResponseCache {
  get(key: string): Promise<unknown | undefined>;
  set(key: string, value: unknown, ttlSec: number): Promise<void>;
}

/** OSS default: never caches. */
class NoopResponseCache implements ResponseCache {
  async get(): Promise<unknown | undefined> {
    return undefined;
  }
  async set(): Promise<void> {
    /* no-op */
  }
}

let cache: ResponseCache = new NoopResponseCache();

export function setResponseCache(next: ResponseCache): void {
  cache = next;
}

export function getResponseCache(): ResponseCache {
  return cache;
}

/** Per-intent TTL in seconds. Intents absent here are never cached (scrape, crawl). */
const TTL_BY_INTENT: Record<string, number> = {
  search: 300,
  serp: 300,
  answer: 600,
  research: 1800,
  docs: 3600,
  social: 120,
};

/** Returns the cache TTL for an intent, or 0 when that intent must not be cached. */
export function cacheTtlForIntent(intent: string): number {
  return TTL_BY_INTENT[intent] ?? 0;
}

function normalizeQuery(query: string): string {
  return query.toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Cache key: intent + normalized query + tenant. The managed impl may hash this. */
export function responseCacheKey(intent: string, query: string, tenantId: string): string {
  return `${intent}|${normalizeQuery(query)}|${tenantId}`;
}
