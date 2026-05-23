import type { Provider, ProviderCreds } from './types.js';

const ENV_KEYS: Record<Provider, string> = {
  exa: 'EXA_API_KEY',
  perplexity: 'PERPLEXITY_API_KEY',
  brave: 'BRAVE_API_KEY',
  tavily: 'TAVILY_API_KEY',
  firecrawl: 'FIRECRAWL_API_KEY',
  serpapi: 'SERPAPI_API_KEY',
  grok: 'XAI_API_KEY',
  context7: 'CONTEXT7_API_KEY',
};

/**
 * Resolve provider credentials for a tenant. This is the commercialization seam.
 *
 * Now: every tenant resolves to the shared keys in process.env (single-tenant 'self').
 * Later: branch on tenantId to a per-tenant encrypted vault (BYOK) or a shared pool
 * (resell) — the call sites in the router never change.
 */
export async function resolveCreds(_tenantId: string): Promise<ProviderCreds> {
  const creds: ProviderCreds = {};
  for (const [provider, envKey] of Object.entries(ENV_KEYS) as [Provider, string][]) {
    const value = process.env[envKey];
    if (value) creds[provider] = value;
  }
  return creds;
}
