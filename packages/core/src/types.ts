export const INTENTS = [
  'search',
  'answer',
  'research',
  'scrape',
  'crawl',
  'social',
  'serp',
  'docs',
] as const;
export type Intent = (typeof INTENTS)[number];

export const PROVIDERS = [
  'exa',
  'perplexity',
  'brave',
  'tavily',
  'firecrawl',
  'serpapi',
  'grok',
  'context7',
] as const;
export type Provider = (typeof PROVIDERS)[number];

export type Recency = 'day' | 'week' | 'month' | 'year';

export interface SearchRequest {
  intent: Intent;
  query: string;
  tenantId: string;
  /** Coarse recency window (maps to provider-native freshness params). */
  recency?: Recency;
  /** YYYY-MM-DD published-date lower bound. */
  dateStart?: string;
  /** YYYY-MM-DD published-date upper bound. */
  dateEnd?: string;
  /** Restrict to these domains where the provider supports it. */
  domains?: string[];
  maxResults?: number;
  /** Opt-in fan-out across the search-shaped trio (exa/brave/tavily). */
  thorough?: boolean;
  /** Required for scrape/crawl intents. */
  url?: string;
  /** Library name for the docs intent (e.g. "next.js"); falls back to query. */
  library?: string;
}

export interface SearchResultItem {
  title: string;
  url: string;
  snippet?: string;
  /** Full page content (markdown/text) when the provider returns it. */
  content?: string;
  publishedDate?: string;
  /** Provider-native relevance score, normalized 0..1 when available. */
  score?: number;
  /** Which provider produced this item (set during fan-out merge). */
  source?: Provider;
}

export interface RoutingInfo {
  provider: Provider;
  reason: string;
  fallbackUsed: boolean;
  /** Providers consulted (>1 only on thorough fan-out). */
  providers?: Provider[];
  latencyMs: number;
}

export interface SearchResponse {
  items: SearchResultItem[];
  /** Synthesized answer for answer/research intents. */
  answer?: string;
  citations?: string[];
  routing: RoutingInfo;
}

/** Credentials for a single tenant, keyed by provider. */
export type ProviderCreds = Partial<Record<Provider, string>>;

export interface ProviderAdapter {
  readonly id: Provider;
  /** Whether this provider can serve the given intent. */
  supports(intent: Intent): boolean;
  /** Execute the request. Throws ProviderError on failure so the router can fall back. */
  run(req: SearchRequest, creds: ProviderCreds): Promise<SearchResponse>;
  /** Rough USD cost estimate for cost-guarding variable-priced providers. */
  estimateCost(req: SearchRequest): number;
}

export class ProviderError extends Error {
  constructor(
    public readonly provider: Provider,
    message: string,
    public override readonly cause?: unknown,
  ) {
    super(`[${provider}] ${message}`);
    this.name = 'ProviderError';
  }
}

export class MissingCredentialError extends ProviderError {
  constructor(provider: Provider) {
    super(provider, 'missing API key');
    this.name = 'MissingCredentialError';
  }
}
