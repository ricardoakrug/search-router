import type {
  Intent,
  ProviderAdapter,
  ProviderCreds,
  SearchRequest,
  SearchResponse,
} from '../types.js';
import { fetchJson, requireKey } from './http.js';

interface ExaResult {
  title?: string;
  url: string;
  text?: string;
  publishedDate?: string;
  score?: number;
}
interface ExaBody {
  results: ExaResult[];
}

/** Exa — neural/semantic search + contents. Best for semantic discovery & date-bounded queries. */
export const exaAdapter: ProviderAdapter = {
  id: 'exa',

  supports(intent: Intent) {
    return intent === 'search' || intent === 'research';
  },

  async run(req: SearchRequest, creds: ProviderCreds): Promise<SearchResponse> {
    const key = requireKey('exa', creds.exa);
    const started = Date.now();
    const body = await fetchJson<ExaBody>('exa', 'https://api.exa.ai/search', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key },
      body: JSON.stringify({
        query: req.query,
        numResults: req.maxResults ?? (req.intent === 'research' ? 15 : 8),
        type: 'auto',
        startPublishedDate: req.dateStart,
        endPublishedDate: req.dateEnd,
        includeDomains: req.domains,
        contents: { text: { maxCharacters: 2000 } },
      }),
    });
    return {
      items: body.results.map((r) => ({
        title: r.title ?? r.url,
        url: r.url,
        content: r.text,
        publishedDate: r.publishedDate,
        score: r.score,
        source: 'exa',
      })),
      routing: {
        provider: 'exa',
        reason: '',
        fallbackUsed: false,
        latencyMs: Date.now() - started,
      },
    };
  },

  estimateCost(req: SearchRequest) {
    // ~$7/1k search + ~$1/1k contents
    return ((req.intent === 'research' ? 12 : 7) + 1) / 1000;
  },
};
