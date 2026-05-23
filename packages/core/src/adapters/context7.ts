import { ProviderError } from '../types.js';
import type {
  Intent,
  ProviderAdapter,
  ProviderCreds,
  SearchRequest,
  SearchResponse,
  SearchResultItem,
} from '../types.js';
import { fetchJson, requireKey } from './http.js';

interface LibSearchBody {
  results?: { id: string; title?: string; description?: string }[];
}
interface CodeSnippet {
  codeTitle?: string;
  codeDescription?: string;
  pageTitle?: string;
  codeList?: { language?: string; code?: string }[];
}
interface InfoSnippet {
  pageId?: string;
  breadcrumb?: string;
  content?: string;
}
interface ContextBody {
  // GET /api/v2/context?type=json returns structured snippets (default type=txt is raw markdown).
  codeSnippets?: CodeSnippet[];
  infoSnippets?: InfoSnippet[];
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

    // 2. fetch docs/context for that library id. type=json returns structured snippets;
    // the default (type=txt) is raw markdown, which fetchJson can't parse.
    const ctx = await fetchJson<ContextBody>(
      'context7',
      `${BASE}/context?${new URLSearchParams({ libraryId: lib.id, query: req.query, type: 'json' }).toString()}`,
      { headers: auth },
    ).catch((e) => {
      throw new ProviderError('context7', 'context fetch failed', e);
    });

    const libUrl = `https://context7.com${lib.id}`;
    const items: SearchResultItem[] = [];

    // Prose docs first, then code examples.
    for (const info of ctx.infoSnippets ?? []) {
      if (!info.content) continue;
      items.push({
        title: info.breadcrumb ?? lib.title ?? lib.id,
        url: info.pageId ?? libUrl,
        snippet: info.breadcrumb,
        content: info.content,
        source: 'context7',
      });
    }
    for (const code of ctx.codeSnippets ?? []) {
      const body = (code.codeList ?? [])
        .map((c) => `\`\`\`${c.language ?? ''}\n${c.code ?? ''}\n\`\`\``)
        .join('\n\n');
      items.push({
        title: code.codeTitle ?? code.pageTitle ?? lib.title ?? lib.id,
        url: libUrl,
        snippet: code.codeDescription,
        content: body || undefined,
        source: 'context7',
      });
    }

    return {
      items,
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
