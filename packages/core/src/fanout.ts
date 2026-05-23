import type { SearchResponse, SearchResultItem } from './types.js';

const RRF_K = 60;

function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hash = '';
    return `${u.host}${u.pathname}`.replace(/\/$/, '').toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

/**
 * Merge results from multiple providers: dedupe by URL, rerank by Reciprocal Rank
 * Fusion across each provider's ordering. Keeps the richest item per URL (one with
 * full content wins over a snippet-only duplicate).
 */
export function mergeResponses(responses: SearchResponse[]): SearchResultItem[] {
  const scores = new Map<string, number>();
  const best = new Map<string, SearchResultItem>();

  for (const res of responses) {
    res.items.forEach((item, rank) => {
      const key = normalizeUrl(item.url);
      scores.set(key, (scores.get(key) ?? 0) + 1 / (RRF_K + rank + 1));
      const existing = best.get(key);
      if (!existing || (!existing.content && item.content)) {
        best.set(key, item);
      }
    });
  }

  return [...best.entries()]
    .map(([key, item]) => ({ ...item, score: scores.get(key) }))
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
}
