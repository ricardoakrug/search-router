import type {
  Intent,
  ProviderAdapter,
  ProviderCreds,
  SearchRequest,
  SearchResponse,
} from '../types.js';
import { fetchJson, requireKey } from './http.js';

interface GrokBody {
  choices: { message: { content: string } }[];
  citations?: string[];
}

/** xAI Grok — live web + X (Twitter) search. Only first-party deep X access. */
export const grokAdapter: ProviderAdapter = {
  id: 'grok',

  supports(intent: Intent) {
    return intent === 'social' || intent === 'answer';
  },

  async run(req: SearchRequest, creds: ProviderCreds): Promise<SearchResponse> {
    const key = requireKey('grok', creds.grok);
    const started = Date.now();
    const sources = req.intent === 'social' ? [{ type: 'x' }, { type: 'web' }] : [{ type: 'web' }];
    const body = await fetchJson<GrokBody>('grok', 'https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: process.env.XAI_MODEL ?? 'grok-4',
        messages: [{ role: 'user', content: req.query }],
        search_parameters: {
          mode: 'on',
          return_citations: true,
          sources,
          ...(req.maxResults ? { max_search_results: req.maxResults } : {}),
          ...(req.dateStart ? { from_date: req.dateStart } : {}),
          ...(req.dateEnd ? { to_date: req.dateEnd } : {}),
        },
      }),
    });
    return {
      answer: body.choices[0]?.message.content,
      citations: body.citations,
      items: (body.citations ?? []).map((url) => ({ title: url, url, source: 'grok' })),
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
