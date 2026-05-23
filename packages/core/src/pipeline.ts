import { getAdapter } from './adapters/index.js';
import { withinBudget } from './costguard.js';
import { resolveCreds } from './creds.js';
import { mergeResponses } from './fanout.js';
import { resolveRoute } from './router/index.js';
import { type Provider, ProviderError, type SearchRequest, type SearchResponse } from './types.js';
import { usageLog } from './usage.js';

/** Providers eligible for `thorough` fan-out (search-shaped, mergeable results). */
const FANOUT_PROVIDERS: Provider[] = ['exa', 'brave', 'tavily'];

function hasResults(res: SearchResponse): boolean {
  return res.items.length > 0 || Boolean(res.answer);
}

/**
 * End-to-end search: resolve creds + route, execute with fallback (or fan-out when
 * `thorough`), attach routing metadata, and emit a usage event. The router's call
 * sites never reference a tenant directly — `resolveCreds` is the only seam.
 */
export async function runSearch(req: SearchRequest): Promise<SearchResponse> {
  const started = Date.now();
  const creds = await resolveCreds(req.tenantId);
  const decision = await resolveRoute(req);

  if (req.thorough && (req.intent === 'search' || req.intent === 'research')) {
    return fanOut(req, creds, started);
  }

  const order = [decision.provider, ...decision.fallback].filter((p) =>
    getAdapter(p).supports(req.intent),
  );

  let lastError: unknown;
  for (let i = 0; i < order.length; i++) {
    const provider = order[i];
    if (!provider) continue;
    if (i === 0 && !withinBudget(provider, req)) {
      // primary over budget — skip straight to fallbacks
      lastError = new ProviderError(provider, 'over per-request budget');
      continue;
    }
    if (!creds[provider]) {
      lastError = new ProviderError(provider, 'missing API key');
      continue;
    }
    try {
      const res = await getAdapter(provider).run(req, creds);
      if (!hasResults(res) && i < order.length - 1) continue; // empty → try fallback
      const fallbackUsed = provider !== decision.provider;
      const latencyMs = Date.now() - started;
      usageLog({
        tenantId: req.tenantId,
        intent: req.intent,
        provider,
        costEst: getAdapter(provider).estimateCost(req),
        latencyMs,
        fallbackUsed,
      });
      return {
        ...res,
        routing: { provider, reason: decision.reason, fallbackUsed, latencyMs },
      };
    } catch (err) {
      lastError = err;
    }
  }
  throw new ProviderError(
    decision.provider,
    `all providers failed for intent "${req.intent}"`,
    lastError,
  );
}

async function fanOut(
  req: SearchRequest,
  creds: Awaited<ReturnType<typeof resolveCreds>>,
  started: number,
): Promise<SearchResponse> {
  const providers = FANOUT_PROVIDERS.filter(
    (p) => creds[p] && getAdapter(p).supports(req.intent) && withinBudget(p, req),
  );
  const settled = await Promise.allSettled(providers.map((p) => getAdapter(p).run(req, creds)));
  const ok: SearchResponse[] = [];
  const used: Provider[] = [];
  settled.forEach((s, idx) => {
    if (s.status === 'fulfilled') {
      ok.push(s.value);
      const p = providers[idx];
      if (p) used.push(p);
    }
  });
  if (ok.length === 0) {
    throw new ProviderError('exa', 'thorough fan-out: all providers failed');
  }
  const items = mergeResponses(ok);
  const latencyMs = Date.now() - started;
  for (const p of used) {
    usageLog({
      tenantId: req.tenantId,
      intent: req.intent,
      provider: p,
      costEst: getAdapter(p).estimateCost(req),
      latencyMs,
      fallbackUsed: false,
    });
  }
  return {
    items,
    routing: {
      provider: used[0] ?? 'exa',
      reason: `thorough fan-out (${used.join(', ')})`,
      fallbackUsed: false,
      providers: used,
      latencyMs,
    },
  };
}
