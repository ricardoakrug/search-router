import { afterEach, describe, expect, it } from 'vitest';
import { defaultRouter, resolveRoute, setRouter } from '../src/router/index.js';
import type { Intent, SearchRequest } from '../src/types.js';

function req(partial: Partial<SearchRequest> & { intent: Intent; query: string }): SearchRequest {
  return { tenantId: 'self', ...partial };
}

// Restore the default after each test — the router is a module-global mutable,
// same isolation hazard as the usage sink.
afterEach(() => setRouter(defaultRouter));

describe('router injection seam (setRouter)', () => {
  it('uses an injected sync router instead of the default', async () => {
    setRouter(() => ({ provider: 'serpapi', reason: 'STUB', fallback: [] }));
    const d = await resolveRoute(req({ intent: 'search', query: 'x' }));
    expect(d.reason).toBe('STUB');
    expect(d.provider).toBe('serpapi');
  });

  it('accepts an async router (managed/classifier shape)', async () => {
    setRouter(async () =>
      Promise.resolve({ provider: 'brave', reason: 'ASYNC-STUB', fallback: ['exa'] }),
    );
    const d = await resolveRoute(req({ intent: 'search', query: 'x' }));
    expect(d.reason).toBe('ASYNC-STUB');
    expect(d.provider).toBe('brave');
  });

  it('falls back to the intent-only default once restored', async () => {
    setRouter(() => ({ provider: 'serpapi', reason: 'STUB', fallback: [] }));
    setRouter(defaultRouter);
    const d = await resolveRoute(req({ intent: 'search', query: 'x' }));
    expect(d.provider).toBe('exa');
    expect(d.reason).toBe('default search');
  });
});
