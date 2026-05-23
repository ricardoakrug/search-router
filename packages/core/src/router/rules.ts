import type { SearchRequest } from '../types.js';
import type { RouteDecision } from './index.js';

/**
 * Minimal default router: maps each intent to its primary provider (+ fallbacks).
 * Intent maps 1:1 to the MCP tool name, so this is tool-name routing. It does no
 * query-text or date inspection — plug in an advanced router via `setRouter` for that.
 */
export function defaultRouter(req: SearchRequest): RouteDecision {
  switch (req.intent) {
    case 'scrape':
      return { provider: 'firecrawl', reason: 'single-URL scrape', fallback: ['tavily', 'exa'] };
    case 'crawl':
      return { provider: 'firecrawl', reason: 'full-site crawl', fallback: ['tavily'] };
    case 'docs':
      return { provider: 'context7', reason: 'library/framework docs', fallback: ['exa'] };
    case 'serp':
      return { provider: 'serpapi', reason: 'structured SERP features', fallback: ['brave'] };
    case 'social':
      return { provider: 'grok', reason: 'real-time X/social', fallback: ['serpapi', 'brave'] };
    case 'answer':
      return {
        provider: 'brave',
        reason: 'cited answer (interactive latency)',
        fallback: ['perplexity', 'tavily'],
      };
    case 'research':
      return { provider: 'tavily', reason: 'multi-hop research', fallback: ['perplexity', 'exa'] };
    case 'search':
      return { provider: 'exa', reason: 'default search', fallback: ['brave', 'tavily'] };
  }
}
