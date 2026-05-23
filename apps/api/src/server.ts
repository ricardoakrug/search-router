import { serve } from '@hono/node-server';
import { api } from './routes.js';

const port = Number(process.env.PORT ?? 8787);

serve({ fetch: api.fetch, port }, (info) => {
  console.log(
    JSON.stringify({ type: 'startup', msg: 'search-router api listening', port: info.port }),
  );
});
