import type {
  Intent,
  ProviderAdapter,
  ProviderCreds,
  SearchRequest,
  SearchResponse,
} from '../types.js';
import { fetchJson, requireKey } from './http.js';

interface GrokResponse {
  // POST /v1/responses returns an output[] of mixed items; the final 'message' item
  // carries an 'output_text' whose `annotations` hold the url_citation sources.
  output?: {
    type: string;
    content?: {
      type: string;
      text?: string;
      annotations?: { type: string; url?: string }[];
    }[];
  }[];
}

/** xAI Grok — live web + X (Twitter) search via the Agent Tools / Responses API. */
export const grokAdapter: ProviderAdapter = {
  id: 'grok',

  supports(intent: Intent) {
    return intent === 'social' || intent === 'answer';
  },

  async run(req: SearchRequest, creds: ProviderCreds): Promise<SearchResponse> {
    const key = requireKey('grok', creds.grok);
    const started = Date.now();

    // social → X + web; answer → web only. (Live Search / search_parameters was
    // deprecated 2026-01; this uses the server-side tools on /v1/responses.)
    const xSearch: Record<string, unknown> = { type: 'x_search' };
    if (req.dateStart) xSearch.from_date = req.dateStart;
    if (req.dateEnd) xSearch.to_date = req.dateEnd;
    const webSearch: Record<string, unknown> = { type: 'web_search' };
    if (req.domains?.length) webSearch.filters = { allowed_domains: req.domains.slice(0, 5) };
    const tools = req.intent === 'social' ? [xSearch, webSearch] : [webSearch];

    const body = await fetchJson<GrokResponse>('grok', 'https://api.x.ai/v1/responses', {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: process.env.XAI_MODEL ?? 'grok-4',
        input: [{ role: 'user', content: req.query }],
        tools,
      }),
    });

    const message = body.output?.find((o) => o.type === 'message');
    const outputText = message?.content?.find((c) => c.type === 'output_text');
    const urls: string[] = [];
    for (const a of outputText?.annotations ?? []) {
      if (a.type === 'url_citation' && a.url && !urls.includes(a.url)) urls.push(a.url);
    }

    return {
      answer: outputText?.text,
      citations: urls,
      items: urls.map((url) => ({ title: url, url, source: 'grok' as const })),
      routing: {
        provider: 'grok',
        reason: '',
        fallbackUsed: false,
        latencyMs: Date.now() - started,
      },
    };
  },

  estimateCost() {
    return 0.005; // ~$5/1k search tool calls + tokens
  },
};
