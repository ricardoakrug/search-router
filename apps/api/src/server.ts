import { serve } from '@hono/node-server';
import { log } from './log.js';
import { api } from './routes.js';

const port = Number(process.env.PORT ?? 8787);
const SHUTDOWN_TIMEOUT_MS = Number(process.env.SHUTDOWN_TIMEOUT_MS ?? 10_000);

const server = serve({ fetch: api.fetch, port }, (info) => {
  log.info({ port: info.port }, 'search-router api listening');
});

/** Stop accepting connections, drain in-flight requests, then exit. */
function shutdown(signal: string): void {
  log.info({ signal }, 'shutting down');
  const force = setTimeout(() => {
    log.error('shutdown timed out; forcing exit');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  force.unref();

  server.close((err) => {
    if (err) {
      log.error({ err: err.message }, 'error during shutdown');
      process.exit(1);
    }
    process.exit(0);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
