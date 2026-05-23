import { getConnInfo } from '@hono/node-server/conninfo';
import type { Context, MiddlewareHandler, Next } from 'hono';
import ipaddr from 'ipaddr.js';

/**
 * In-memory fixed-window rate limiter. Single-instance only — counters live in this
 * process and do not span replicas (Redis-backed limiting is a later tier).
 *
 * Keyed by the client's socket address, not the bearer token (a single-tenant deploy
 * shares one token, and an unvalidated token is attacker-rotatable — both make a token
 * key the wrong unit). The `x-forwarded-for` hop is only trusted when TRUST_PROXY=true,
 * since an untrusted client can spoof that header to mint a fresh window per request.
 * RATE_LIMIT_RPM=0 disables the limiter.
 */

const WINDOW_MS = 60_000;

interface Window {
  count: number;
  resetAt: number;
}

const windows = new Map<string, Window>();

// Evict stale windows so the map cannot grow unbounded under churning keys.
const sweeper = setInterval(() => {
  const now = Date.now();
  for (const [key, w] of windows) {
    if (w.resetAt <= now) windows.delete(key);
  }
}, WINDOW_MS);
sweeper.unref();

function limit(): number {
  const n = Number(process.env.RATE_LIMIT_RPM ?? 60);
  return Number.isFinite(n) ? n : 60;
}

function clientKey(c: Context): string {
  if (process.env.TRUST_PROXY === 'true') {
    const fwd = c.req.header('x-forwarded-for')?.split(',')[0]?.trim();
    if (fwd && ipaddr.isValid(fwd)) return `ip:${fwd}`;
  }
  try {
    const address = getConnInfo(c).remote.address;
    if (address) return `ip:${address}`;
  } catch {
    // No socket info (e.g. in-process test requests) — fall through.
  }
  return 'ip:unknown';
}

export const rateLimit: MiddlewareHandler = async (c: Context, next: Next) => {
  const max = limit();
  if (max <= 0) return next();

  const key = clientKey(c);
  const now = Date.now();
  let w = windows.get(key);
  if (!w || w.resetAt <= now) {
    w = { count: 0, resetAt: now + WINDOW_MS };
    windows.set(key, w);
  }
  w.count += 1;

  if (w.count > max) {
    const retryAfter = Math.ceil((w.resetAt - now) / 1000);
    c.header('Retry-After', String(retryAfter));
    return c.json({ error: 'rate limit exceeded' }, 429);
  }
  return next();
};

/** Test seam: clear all rate-limit windows between cases. */
export function _resetRateLimit(): void {
  windows.clear();
}
