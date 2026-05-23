import type { Provider, ProviderAdapter } from '../types.js';
import { braveAdapter } from './brave.js';
import { context7Adapter } from './context7.js';
import { exaAdapter } from './exa.js';
import { firecrawlAdapter } from './firecrawl.js';
import { grokAdapter } from './grok.js';
import { perplexityAdapter } from './perplexity.js';
import { serpapiAdapter } from './serpapi.js';
import { tavilyAdapter } from './tavily.js';

export const ADAPTERS: Record<Provider, ProviderAdapter> = {
  exa: exaAdapter,
  perplexity: perplexityAdapter,
  brave: braveAdapter,
  tavily: tavilyAdapter,
  firecrawl: firecrawlAdapter,
  serpapi: serpapiAdapter,
  grok: grokAdapter,
  context7: context7Adapter,
};

export function getAdapter(provider: Provider): ProviderAdapter {
  return ADAPTERS[provider];
}
