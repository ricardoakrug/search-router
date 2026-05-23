import { describe, expect, it } from 'vitest';
import { mergeResponses } from '../src/fanout.js';
import type { SearchResponse } from '../src/types.js';

function resp(items: { url: string; content?: string }[]): SearchResponse {
  return {
    items: items.map((i) => ({ title: i.url, url: i.url, content: i.content })),
    routing: { provider: 'exa', reason: '', fallbackUsed: false, latencyMs: 0 },
  };
}

describe('fan-out merge (acceptance #3)', () => {
  it('dedupes by normalized URL across providers', () => {
    const a = resp([{ url: 'https://x.com/a' }, { url: 'https://x.com/b' }]);
    const b = resp([{ url: 'https://x.com/a/' }, { url: 'https://x.com/c' }]); // a/ == a
    const merged = mergeResponses([a, b]);
    const urls = merged.map((m) => m.url);
    expect(urls.length).toBe(3); // a, b, c — not 4
  });

  it('ranks a URL appearing in multiple providers above singletons (RRF)', () => {
    const a = resp([{ url: 'https://x.com/shared' }, { url: 'https://x.com/onlyA' }]);
    const b = resp([{ url: 'https://x.com/shared' }, { url: 'https://x.com/onlyB' }]);
    const merged = mergeResponses([a, b]);
    expect(merged[0]?.url).toBe('https://x.com/shared');
  });

  it('keeps the richer item (with content) when deduping', () => {
    const a = resp([{ url: 'https://x.com/a' }]); // snippet only
    const b = resp([{ url: 'https://x.com/a', content: 'full body' }]);
    const merged = mergeResponses([a, b]);
    expect(merged.find((m) => m.url.includes('/a'))?.content).toBe('full body');
  });
});
