/**
 * Rate-limit storage seam. The OSS default keeps counters in this process (single
 * instance); the managed layer injects a Redis-backed store that spans replicas via
 * `setRateLimitStore`. Mirrors the `Authenticator`/`setAuthenticator` seam — interface
 * + setter + in-memory default, no new dependency in core.
 */
export interface RateLimitResult {
  count: number;
  resetAt: number;
}

export interface RateLimitStore {
  /** Record one hit for `key` in a `windowMs` fixed window; return the running count + window end. */
  hit(key: string, windowMs: number): Promise<RateLimitResult>;
  /** Optional test/maintenance seam: clear all counters. */
  reset?(): void;
}

interface Window {
  count: number;
  resetAt: number;
}

/** In-memory fixed-window store. The original single-instance behavior, lifted verbatim. */
export class MemoryRateLimitStore implements RateLimitStore {
  private windows = new Map<string, Window>();

  constructor() {
    // Evict stale windows so the map cannot grow unbounded under churning keys.
    const sweeper = setInterval(() => {
      const now = Date.now();
      for (const [key, w] of this.windows) {
        if (w.resetAt <= now) this.windows.delete(key);
      }
    }, 60_000);
    sweeper.unref();
  }

  async hit(key: string, windowMs: number): Promise<RateLimitResult> {
    const now = Date.now();
    let w = this.windows.get(key);
    if (!w || w.resetAt <= now) {
      w = { count: 0, resetAt: now + windowMs };
      this.windows.set(key, w);
    }
    w.count += 1;
    return { count: w.count, resetAt: w.resetAt };
  }

  reset(): void {
    this.windows.clear();
  }
}

let store: RateLimitStore = new MemoryRateLimitStore();

/** Swap the rate-limit store (Redis-backed managed limiter) without touching the middleware. */
export function setRateLimitStore(next: RateLimitStore): void {
  store = next;
}

export function getRateLimitStore(): RateLimitStore {
  return store;
}
