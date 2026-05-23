import { describe, expect, it } from 'vitest';
import { defaultRouter } from '../src/router/rules.js';
import type { Intent, SearchRequest } from '../src/types.js';

function req(partial: Partial<SearchRequest> & { intent: Intent; query: string }): SearchRequest {
  return { tenantId: 'self', ...partial };
}

describe('default router: intent → provider (acceptance #1)', () => {
  it('routes scrape intent (URL) to firecrawl', () => {
    const d = defaultRouter(req({ intent: 'scrape', query: 'x', url: 'https://a.com' }));
    expect(d.provider).toBe('firecrawl');
  });

  it('routes docs intent to context7', () => {
    const d = defaultRouter(
      req({ intent: 'docs', query: 'how do I use server actions in next.js' }),
    );
    expect(d.provider).toBe('context7');
  });

  it('routes social intent to grok', () => {
    const d = defaultRouter(req({ intent: 'social', query: 'what is trending on X about AI' }));
    expect(d.provider).toBe('grok');
  });

  it('routes serp intent to serpapi', () => {
    const d = defaultRouter(req({ intent: 'serp', query: 'best laptops shopping results' }));
    expect(d.provider).toBe('serpapi');
  });

  it('routes research intent to tavily', () => {
    const d = defaultRouter(req({ intent: 'research', query: 'compare vector databases' }));
    expect(d.provider).toBe('tavily');
  });

  it('routes answer intent to brave', () => {
    const d = defaultRouter(req({ intent: 'answer', query: 'capital of france' }));
    expect(d.provider).toBe('brave');
  });

  it('routes generic search to exa with brave/tavily fallback', () => {
    const d = defaultRouter(req({ intent: 'search', query: 'blue widget manufacturers' }));
    expect(d.provider).toBe('exa');
    expect(d.fallback).toEqual(['brave', 'tavily']);
  });

  it('always provides at least one fallback', () => {
    const d = defaultRouter(req({ intent: 'scrape', query: 'x', url: 'https://a.com' }));
    expect(d.fallback.length).toBeGreaterThan(0);
  });
});
