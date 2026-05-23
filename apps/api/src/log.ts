import { randomUUID } from 'node:crypto';
import type { Context, MiddlewareHandler, Next } from 'hono';
import { pino } from 'pino';

declare module 'hono' {
  interface ContextVariableMap {
    requestId: string;
  }
}

/** Process logger. LOG_LEVEL controls verbosity (default info). */
export const log = pino({ level: process.env.LOG_LEVEL ?? 'info' });

/**
 * Attach a request id (honoring an inbound x-request-id), echo it back, and emit one
 * structured access log per request with method, path, status, and latency.
 */
export const requestLogger: MiddlewareHandler = async (c: Context, next: Next) => {
  const requestId = c.req.header('x-request-id') ?? randomUUID();
  c.set('requestId', requestId);
  c.header('x-request-id', requestId);

  const started = Date.now();
  await next();
  log.info({
    requestId,
    method: c.req.method,
    path: c.req.path,
    status: c.res.status,
    latencyMs: Date.now() - started,
  });
};
