import { ProviderError } from '../types.js';
import type {
  Intent,
  ProviderAdapter,
  ProviderCreds,
  SearchRequest,
  SearchResponse,
} from '../types.js';
import { fetchJson, requireKey } from './http.js';

interface LibSearchBody {
  results?: { id: string; title?: string; description?: string }[];
}
interface ContextBody {
  // GET /api/v2/context returns { data }, where data is the docs payload (text or object).
  data?: string | { content?: string };
}

const BASE = 'https://context7.com/api/v2';

/** Context7 — version-pinned library/framework docs + code snippets. */
export const context7Adapter: ProviderAdapter = {
  id: 'context7',

  supports(intent: Intent) {
    return intent === 'docs';
  },

  async run(req: SearchRequest, creds: ProviderCreds): Promise<SearchResponse> {
    const key = requireKey('context7', creds.context7);
    const started = Date.now();
    const auth = { authorization: `Bearer ${key}` };

    // 1. resolve library id (libraryName fuzzy-matches; query drives LLM relevance ranking)
    const search = await fetchJson<LibSearchBody>(
      'context7',
      `${BASE}/libs/search?${new URLSearchParams({
        libraryName: req.library ?? req.query,
        query: req.query,
      }).toString()}`,
      { headers: auth },
    );
    const lib = search.results?.[0];
    if (!lib) {
      return {
        items: [],
        routing: {
          provider: 'context7',
          reason: 'no matching library',
          fallbackUsed: false,
          latencyMs: Date.now() - started,
        },
      };
    }

    // 2. fetch docs/context for that library id
    const ctx = await fetchJson<ContextBody>(
      'context7',
      `${BASE}/context?${new URLSearchParams({ libraryId: lib.id, query: req.query }).toString()}`,
      { headers: auth },
    ).catch((e) => {
      throw new ProviderError('context7', 'context fetch failed', e);
    });

    const content = typeof ctx.data === 'string' ? ctx.data : ctx.data?.content;
    return {
      items: [
        {
          title: lib.title ?? lib.id,
          url: `https://context7.com${lib.id}`,
          content,
          snippet: lib.description,
          source: 'context7',
        },
      ],
      routing: {
        provider: 'context7',
        reason: '',
        fallbackUsed: false,
        latencyMs: Date.now() - started,
      },
    };
  },

  estimateCost() {
    return 0; // free tier; flat per-call later
  },
};
